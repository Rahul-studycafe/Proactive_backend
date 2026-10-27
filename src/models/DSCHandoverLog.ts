import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export const HANDOVER_ACTIONS = ['Handed to Client', 'Received from Client', 'Internal Transfer'] as const;

export interface IDSCHandoverLog extends Document {
  tenantId: mongoose.Types.ObjectId;
  dscId: mongoose.Types.ObjectId;
  action: 'Handed to Client' | 'Received from Client' | 'Internal Transfer';
  transferredToName: string;
  transferredToPhone?: string;
  reason: string;
  expectedReturnDate?: Date;
  receivedBackDate?: Date;
  handledByUserId: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const dscHandoverLogSchema = new Schema<IDSCHandoverLog>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    dscId: {
      type: Schema.Types.ObjectId,
      ref: 'DSC',
      required: true,
      index: true
    },
    action: {
      type: String,
      enum: HANDOVER_ACTIONS,
      required: true
    },
    transferredToName: {
      type: String,
      required: true,
      trim: true
    },
    transferredToPhone: {
      type: String,
      trim: true
    },
    reason: {
      type: String,
      required: true,
      trim: true
    },
    expectedReturnDate: {
      type: Date
    },
    receivedBackDate: {
      type: Date
    },
    handledByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

dscHandoverLogSchema.index({ tenantId: 1, dscId: 1, createdAt: -1 });

dscHandoverLogSchema.plugin(tenantPlugin);

export const DSCHandoverLog = mongoose.model<IDSCHandoverLog>('DSCHandoverLog', dscHandoverLogSchema);
