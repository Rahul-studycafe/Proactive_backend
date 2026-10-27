import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export type NotificationChannel = 'Email' | 'SMS' | 'WhatsApp';

export interface INotificationTemplate extends Document {
  tenantId: mongoose.Types.ObjectId;
  title: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationTemplateSchema = new Schema<INotificationTemplate>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    channel: {
      type: String,
      enum: ['Email', 'SMS', 'WhatsApp'],
      required: true
    },
    subject: {
      type: String,
      trim: true
    },
    body: {
      type: String,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

notificationTemplateSchema.index({ tenantId: 1, title: 1 });
notificationTemplateSchema.index({ tenantId: 1, channel: 1 });

notificationTemplateSchema.plugin(tenantPlugin);

export const NotificationTemplate = mongoose.model<INotificationTemplate>(
  'NotificationTemplate',
  notificationTemplateSchema
);
