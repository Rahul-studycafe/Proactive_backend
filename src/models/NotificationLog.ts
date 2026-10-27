import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export type NotificationStatus = 'Pending' | 'Sent' | 'Failed';

export interface INotificationLog extends Document {
  tenantId: mongoose.Types.ObjectId;
  templateId?: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  channel: 'Email' | 'SMS' | 'WhatsApp';
  recipient: string;
  subject?: string;
  content: string;
  status: NotificationStatus;
  error?: string;
  sentAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationLogSchema = new Schema<INotificationLog>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'NotificationTemplate'
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    channel: {
      type: String,
      enum: ['Email', 'SMS', 'WhatsApp'],
      required: true
    },
    recipient: {
      type: String,
      required: true
    },
    subject: {
      type: String
    },
    content: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Sent', 'Failed'],
      default: 'Sent',
      index: true
    },
    error: {
      type: String
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

notificationLogSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });
notificationLogSchema.index({ tenantId: 1, status: 1 });

notificationLogSchema.plugin(tenantPlugin);

export const NotificationLog = mongoose.model<INotificationLog>(
  'NotificationLog',
  notificationLogSchema
);
