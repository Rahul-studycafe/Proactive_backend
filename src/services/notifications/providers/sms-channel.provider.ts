import { INotificationChannelProvider } from '../notification-channel.interface';
import {
  NotificationChannel,
  NotificationDispatchPayload,
  NotificationRecipient
} from '../../../types/notification.types';

export class SmsChannelProvider implements INotificationChannelProvider {
  public readonly channelName: NotificationChannel = 'sms';

  public async send(
    payload: NotificationDispatchPayload,
    recipient: NotificationRecipient
  ): Promise<void> {
    // Extensible integration stub: DLT compliant SMS gateway (e.g. Fast2SMS, MSG91)
    if (!recipient.mobile) return;
    // When enabled in future phase, dispatch payload to SMS Gateway
  }
}

