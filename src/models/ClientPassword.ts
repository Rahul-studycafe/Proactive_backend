import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface IClientPassword extends Document {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  portalId?: mongoose.Types.ObjectId;
  portalName: string;
  portalUrl?: string;
  username: string;
  encryptedPassword: string;
  iv: string;
  notes?: string;
  lastVerifiedDate?: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const clientPasswordSchema = new Schema<IClientPassword>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    portalId: {
      type: Schema.Types.ObjectId,
      ref: 'PortalMaster',
    },
    portalName: {
      type: String,
      required: true,
      trim: true,
    },
    portalUrl: {
      type: String,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    encryptedPassword: {
      type: String,
      required: true,
      select: false, // Hidden by default from standard queries to prevent accidental leakage
    },
    iv: {
      type: String,
      required: true,
      select: false, // Hidden by default
    },
    notes: {
      type: String,
      trim: true,
    },
    lastVerifiedDate: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
clientPasswordSchema.index({ tenantId: 1, clientId: 1 });
clientPasswordSchema.index({ tenantId: 1, portalName: 1 });
clientPasswordSchema.index({ tenantId: 1, clientId: 1, portalName: 1 });

// Tenant isolation plugin
clientPasswordSchema.plugin(tenantPlugin);

export const ClientPassword = mongoose.model<IClientPassword>('ClientPassword', clientPasswordSchema);
