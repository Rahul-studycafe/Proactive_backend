import {
  NotificationChannel,
  NotificationDispatchPayload,
  NotificationRecipient
} from '../../types/notification.types';

export interface INotificationChannelProvider {
  readonly channelName: NotificationChannel;
  send(
    payload: NotificationDispatchPayload,
    recipient: NotificationRecipient
  ): Promise<void>;
}

