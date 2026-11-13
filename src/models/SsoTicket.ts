import mongoose, { Schema, Document } from 'mongoose';

export interface ISsoTicket extends Document {
  code: string;
  clientId: string;
  email: string;
  externalUserId?: string;
  name?: string;
  targetUserId: mongoose.Types.ObjectId;
  targetTenantId: mongoose.Types.ObjectId;
  targetRoleId: mongoose.Types.ObjectId;
  platformUserId?: mongoose.Types.ObjectId;
  isOwner: boolean;
  isNewOrganization?: boolean;
  redirectPath?: string;
  state?: string;
  used: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ssoTicketSchema = new Schema<ISsoTicket>(
  {
    code: { type: String, required: true, unique: true, index: true },
    clientId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    externalUserId: { type: String },
    name: { type: String },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetTenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    targetRoleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    platformUserId: { type: Schema.Types.ObjectId, ref: 'PlatformUser' },
    isOwner: { type: Boolean, default: false },
    isNewOrganization: { type: Boolean, default: false },
    redirectPath: { type: String, default: '/' },
    state: { type: String },
    used: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

export const SsoTicket = mongoose.model<ISsoTicket>('SsoTicket', ssoTicketSchema);

