import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface IPasswordAuditLog extends Document {
  tenantId: mongoose.Types.ObjectId;
  passwordId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  portalName: string;
  username?: string;
  accessedByUserId: mongoose.Types.ObjectId;
  accessedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  purpose?: string;
}

const passwordAuditLogSchema = new Schema<IPasswordAuditLog>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    passwordId: {
      type: Schema.Types.ObjectId,
      ref: 'ClientPassword',
      required: true,
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    portalName: {
      type: String,
      required: true,
    },
    username: {
      type: String,
    },
    accessedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    accessedAt: {
      type: Date,
      default: Date.now,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    purpose: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: false,
  }
);

passwordAuditLogSchema.index({ tenantId: 1, passwordId: 1, accessedAt: -1 });
passwordAuditLogSchema.index({ tenantId: 1, clientId: 1, accessedAt: -1 });
passwordAuditLogSchema.index({ tenantId: 1, accessedByUserId: 1, accessedAt: -1 });

passwordAuditLogSchema.plugin(tenantPlugin);

export const PasswordAuditLog = mongoose.model<IPasswordAuditLog>('PasswordAuditLog', passwordAuditLogSchema);
