import mongoose from 'mongoose';
import {
  NotificationChannel,
  NotificationDispatchPayload,
  NotificationRecipient
} from '../../types/notification.types';
import { NOTIFICATION_EVENTS_CATALOGUE } from '../../config/notification-events-catalogue';
import { INotificationChannelProvider } from './notification-channel.interface';
import { InAppChannelProvider } from './providers/in-app-channel.provider';
import { EmailChannelProvider } from './providers/email-channel.provider';
import { WhatsAppChannelProvider } from './providers/whatsapp-channel.provider';
import { SmsChannelProvider } from './providers/sms-channel.provider';
import { UserNotificationPreference } from '../../models/UserNotificationPreference';
import {
  TenantNotificationPolicy,
  ITenantNotificationPolicy
} from '../../models/TenantNotificationPolicy';
import { User } from '../../modules/auth/schemas';

class NotificationDispatcherService {
  private providers: Map<NotificationChannel, INotificationChannelProvider> =
    new Map();

  constructor() {
    this.registerProvider(new InAppChannelProvider());
    this.registerProvider(new EmailChannelProvider());
    this.registerProvider(new WhatsAppChannelProvider());
    this.registerProvider(new SmsChannelProvider());
  }

  public registerProvider(provider: INotificationChannelProvider): void {
    this.providers.set(provider.channelName, provider);
  }

  /**
   * Main dispatch entry point for application events.
   * Asynchronous, non-blocking: Never throws exceptions to calling controllers.
   */
  public async dispatch(payload: NotificationDispatchPayload): Promise<void> {
    try {
      if (!payload.recipients || payload.recipients.length === 0) {
        return;
      }

      // 1. Find or seed tenant notification policy
      const orgPolicy = await this.getOrCreateTenantPolicy(payload.tenantId);
      const eventPolicy = orgPolicy.policies.find(
        (p) => p.eventKey === payload.eventKey
      );

      // If org policy disabled this event firm-wide, stop
      if (eventPolicy && eventPolicy.isEnabled === false) {
        return;
      }

      const catalogueDef = NOTIFICATION_EVENTS_CATALOGUE.find(
        (c) => c.eventKey === payload.eventKey
      );

      const isMandatory =
        payload.isMandatory ??
        eventPolicy?.isMandatory ??
        catalogueDef?.isMandatory ??
        false;

      // 2. Hydrate missing recipient details (name, email) if necessary
      const recipientIds = payload.recipients
        .filter((r) => !r.email)
        .map((r) => r.userId);

      const userMap = new Map<string, any>();
      if (recipientIds.length > 0) {
        const users = await User.find({
          _id: { $in: recipientIds },
          tenantId: payload.tenantId
        })
          .select('name email mobile')
          .lean();

        users.forEach((u) => userMap.set(u._id.toString(), u));
      }

      const hydratedRecipients: NotificationRecipient[] =
        payload.recipients.map((r) => {
          const userDb = userMap.get(r.userId.toString());
          return {
            userId: r.userId,
            name: r.name || userDb?.name || 'User',
            email: r.email || userDb?.email,
            mobile: r.mobile || userDb?.mobile
          };
        });

      // 3. Query preferences for all recipients in one batch
      const userPrefs = await UserNotificationPreference.find({
        tenantId: payload.tenantId,
        userId: { $in: hydratedRecipients.map((r) => r.userId) }
      }).lean();

      const prefMap = new Map<string, any>();
      userPrefs.forEach((up) => prefMap.set(up.userId.toString(), up));

      const sendPromises: Promise<any>[] = [];

      // 4. Resolve delivery for each recipient
      for (const recipient of hydratedRecipients) {
        const recipientPrefDoc = prefMap.get(recipient.userId.toString());
        const eventUserPref = recipientPrefDoc?.preferences?.find(
          (p: any) => p.eventKey === payload.eventKey
        );

        let deliverInApp =
          eventPolicy?.defaultInApp ?? catalogueDef?.defaultInApp ?? true;
        let deliverEmail =
          eventPolicy?.defaultEmail ?? catalogueDef?.defaultEmail ?? false;

        if (isMandatory) {
          // Mandatory notifications always delivered via In-App and Email
          deliverInApp = true;
          deliverEmail = true;
        } else if (eventUserPref) {
          deliverInApp = eventUserPref.inApp ?? deliverInApp;
          deliverEmail = eventUserPref.email ?? deliverEmail;
        }

        // Send In-App
        if (deliverInApp) {
          const inAppProvider = this.providers.get('in_app');
          if (inAppProvider) {
            sendPromises.push(
              inAppProvider.send(payload, recipient).catch((err) => {
                console.error('[NotificationDispatcher] In-App send error:', err);
              })
            );
          }
        }

        // Send Email
        if (deliverEmail && recipient.email) {
          const emailProvider = this.providers.get('email');
          if (emailProvider) {
            sendPromises.push(
              emailProvider.send(payload, recipient).catch((err) => {
                console.error('[NotificationDispatcher] Email send error:', err);
              })
            );
          }
        }
      }

      await Promise.all(sendPromises);
    } catch (error) {
      console.error(
        '[NotificationDispatcher] Failed to dispatch notification payload:',
        error
      );
    }
  }

  /**
   * Helper to ensure a tenant has an initialized policy
   */
  public async getOrCreateTenantPolicy(
    tenantId: mongoose.Types.ObjectId
  ): Promise<ITenantNotificationPolicy> {
    let policy = await TenantNotificationPolicy.findOne({ tenantId });
    if (!policy) {
      policy = await TenantNotificationPolicy.create({
        tenantId,
        policies: NOTIFICATION_EVENTS_CATALOGUE.map((item) => ({
          eventKey: item.eventKey,
          category: item.category,
          name: item.name,
          description: item.description,
          isMandatory: item.isMandatory,
          isEnabled: true,
          defaultInApp: item.defaultInApp,
          defaultEmail: item.defaultEmail,
          defaultWhatsapp: false,
          defaultSms: false
        }))
      });
    }
    return policy;
  }
}

export const notificationDispatcher = new NotificationDispatcherService();

