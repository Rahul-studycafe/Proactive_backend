import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';
import { NotificationCategory } from '../types/notification.types';

export interface ITenantEventPolicy {
  eventKey: string;
  category: NotificationCategory;
  name: string;
  description: string;
  isMandatory: boolean;
  isEnabled: boolean;
  defaultInApp: boolean;
  defaultEmail: boolean;
  defaultWhatsapp?: boolean;
  defaultSms?: boolean;
}

export interface ITenantNotificationPolicy extends Document {
  tenantId: mongoose.Types.ObjectId;
  policies: ITenantEventPolicy[];
  createdAt: Date;
  updatedAt: Date;
}

const tenantNotificationPolicySchema =
  new Schema<ITenantNotificationPolicy>(
    {
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        unique: true,
        index: true
      },
      policies: [
        {
          eventKey: { type: String, required: true },
          category: { type: String, required: true },
          name: { type: String, required: true },
          description: { type: String, default: '' },
          isMandatory: { type: Boolean, default: false },
          isEnabled: { type: Boolean, default: true },
          defaultInApp: { type: Boolean, default: true },
          defaultEmail: { type: Boolean, default: true },
          defaultWhatsapp: { type: Boolean, default: false },
          defaultSms: { type: Boolean, default: false }
        }
      ]
    },
    { timestamps: true }
  );

tenantNotificationPolicySchema.plugin(tenantPlugin);

export const TenantNotificationPolicy =
  mongoose.model<ITenantNotificationPolicy>(
    'TenantNotificationPolicy',
    tenantNotificationPolicySchema
  );

