import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface IChannelPreference {
  eventKey: string;
  inApp: boolean;
  email: boolean;
  whatsapp?: boolean;
  sms?: boolean;
}

export interface IUserNotificationPreference extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  preferences: IChannelPreference[];
  createdAt: Date;
  updatedAt: Date;
}

const userNotificationPreferenceSchema =
  new Schema<IUserNotificationPreference>(
    {
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
      },
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
      },
      preferences: [
        {
          eventKey: { type: String, required: true },
          inApp: { type: Boolean, default: true },
          email: { type: Boolean, default: true },
          whatsapp: { type: Boolean, default: false },
          sms: { type: Boolean, default: false }
        }
      ]
    },
    { timestamps: true }
  );

// Each user has exactly one preference record per tenant
userNotificationPreferenceSchema.index(
  { tenantId: 1, userId: 1 },
  { unique: true }
);

userNotificationPreferenceSchema.plugin(tenantPlugin);

export const UserNotificationPreference =
  mongoose.model<IUserNotificationPreference>(
    'UserNotificationPreference',
    userNotificationPreferenceSchema
  );

