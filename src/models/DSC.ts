import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export const DSC_CLASSES = ['Class 2', 'Class 3'] as const;
export const TOKEN_TYPES = ['ePass2003', 'ProxKey', 'mToken', 'Watchdata', 'Other'] as const;
export const ISSUING_AUTHORITIES = ['eMudhra', 'Capricorn', 'Vsign', 'Sify', 'IDSign', 'Other'] as const;
export const DSC_STATUSES = ['In Office', 'With Client', 'Expired', 'Renewed'] as const;

export interface IDSC extends Document {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  certificateName: string; // e.g. "Rahul Chauhan - Director DSC"
  certificateClass: 'Class 2' | 'Class 3';
  tokenType: 'ePass2003' | 'ProxKey' | 'mToken' | 'Watchdata' | 'Other';
  tokenSerialNumber?: string; // Hardware USB dongle serial
  issuingAuthority: 'eMudhra' | 'Capricorn' | 'Vsign' | 'Sify' | 'IDSign' | 'Other';
  issueDate: Date;
  expiryDate: Date;
  physicalLocation: string; // e.g. "Safe Box 1, Slot D-14"
  status: 'In Office' | 'With Client' | 'Expired' | 'Renewed';
  currentHolderName?: string; // If 'With Client' or out with staff
  alertMilestonesSent: ('30_day' | '15_day' | '7_day')[];
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const dscSchema = new Schema<IDSC>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    certificateName: {
      type: String,
      required: true,
      trim: true
    },
    certificateClass: {
      type: String,
      enum: DSC_CLASSES,
      default: 'Class 3'
    },
    tokenType: {
      type: String,
      enum: TOKEN_TYPES,
      default: 'ePass2003'
    },
    tokenSerialNumber: {
      type: String,
      trim: true
    },
    issuingAuthority: {
      type: String,
      enum: ISSUING_AUTHORITIES,
      default: 'eMudhra'
    },
    issueDate: {
      type: Date,
      required: true
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true
    },
    physicalLocation: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: DSC_STATUSES,
      default: 'In Office',
      index: true
    },
    currentHolderName: {
      type: String,
      trim: true
    },
    alertMilestonesSent: {
      type: [String],
      enum: ['30_day', '15_day', '7_day'],
      default: []
    },
    notes: {
      type: String,
      trim: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for high-speed multi-tenant lookup and inventory filtration
dscSchema.index({ tenantId: 1, clientId: 1, expiryDate: 1 });
dscSchema.index({ tenantId: 1, status: 1 });
dscSchema.index({ tenantId: 1, certificateName: 'text', tokenSerialNumber: 'text' });

dscSchema.plugin(tenantPlugin);

export const DSC = mongoose.model<IDSC>('DSC', dscSchema);
