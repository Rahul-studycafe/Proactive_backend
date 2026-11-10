import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';
import {
  NotificationCategory,
  NotificationPriority
} from '../types/notification.types';

export interface IInAppNotification extends Document {
  tenantId: mongoose.Types.ObjectId;
  recipientId: mongoose.Types.ObjectId;
  eventKey: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  readAt?: Date;
  actorId?: mongoose.Types.ObjectId;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const inAppNotificationSchema = new Schema<IInAppNotification>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    eventKey: {
      type: String,
      required: true,
      index: true
    },
    category: {
      type: String,
      required: true,
      enum: [
        'tasks',
        'billing',
        'documents',
        'dsc_vault',
        'attendance',
        'security',
        'subscription'
      ]
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    link: {
      type: String,
      trim: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

// High performance compound indexes for fast TopBar unread queries and pagination
inAppNotificationSchema.index({
  tenantId: 1,
  recipientId: 1,
  isRead: 1,
  createdAt: -1
});

inAppNotificationSchema.plugin(tenantPlugin);

export const InAppNotification = mongoose.model<IInAppNotification>(
  'InAppNotification',
  inAppNotificationSchema
);

