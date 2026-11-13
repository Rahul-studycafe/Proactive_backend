import mongoose, { Schema, Document } from 'mongoose';

export interface ISsoClient extends Document {
  clientId: string;
  clientSecretHash: string;
  name: string;
  description?: string;
  allowedRedirectUris: string[];
  provisioningMode: 'auto_provision' | 'require_existing';
  defaultPlanMaxUsers: number;
  ipWhitelist?: string[];
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ssoClientSchema = new Schema<ISsoClient>(
  {
    clientId: { type: String, required: true, unique: true, index: true },
    clientSecretHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    allowedRedirectUris: [{ type: String, required: true }],
    provisioningMode: {
      type: String,
      enum: ['auto_provision', 'require_existing'],
      default: 'auto_provision',
    },
    defaultPlanMaxUsers: { type: Number, default: 5 },
    ipWhitelist: [{ type: String }],
    isActive: { type: Boolean, default: true },
    lastUsedAt: { type: Date },
  },
  { timestamps: true }
);

export const SsoClient = mongoose.model<ISsoClient>('SsoClient', ssoClientSchema);

