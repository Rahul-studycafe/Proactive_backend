import { INotificationChannelProvider } from '../notification-channel.interface';
import {
  NotificationChannel,
  NotificationDispatchPayload,
  NotificationRecipient
} from '../../../types/notification.types';

export class WhatsAppChannelProvider implements INotificationChannelProvider {
  public readonly channelName: NotificationChannel = 'whatsapp';

  public async send(
    payload: NotificationDispatchPayload,
    recipient: NotificationRecipient
  ): Promise<void> {
    // Extensible integration stub: Gupshup, Twilio WhatsApp, or Meta Cloud API
    if (!recipient.mobile) return;
    // When enabled in future phase, dispatch payload to WhatsApp Gateway
  }
}

