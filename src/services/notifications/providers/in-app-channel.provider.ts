import { INotificationChannelProvider } from '../notification-channel.interface';
import {
  NotificationChannel,
  NotificationDispatchPayload,
  NotificationRecipient
} from '../../../types/notification.types';
import { InAppNotification } from '../../../models/InAppNotification';

export class InAppChannelProvider implements INotificationChannelProvider {
  public readonly channelName: NotificationChannel = 'in_app';

  public async send(
    payload: NotificationDispatchPayload,
    recipient: NotificationRecipient
  ): Promise<void> {
    try {
      await InAppNotification.create({
        tenantId: payload.tenantId,
        recipientId: recipient.userId,
        eventKey: payload.eventKey,
        category: payload.category,
        priority: payload.priority || 'medium',
        title: payload.title,
        message: payload.message,
        link: payload.link,
        actorId: payload.actorId,
        metadata: payload.metadata || {},
        isRead: false
      });
    } catch (error) {
      console.error(
        `[InAppChannelProvider] Failed to persist in-app notification for user ${recipient.userId}:`,
        error
      );
    }
  }
}

