import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export const COMPLIANCE_QUERY_TYPES = ['PAN', 'GSTIN'] as const;
export type ComplianceQueryType = typeof COMPLIANCE_QUERY_TYPES[number];

export const COMPLIANCE_STATUSES = [
  'Active',
  'Inactive',
  'NotFound',
  'Cancelled',
  'Suspended'
] as const;
export type ComplianceStatus = typeof COMPLIANCE_STATUSES[number];

export interface IComplianceLog extends MongooseDocument {
  tenantId: mongoose.Types.ObjectId;
  queryType: ComplianceQueryType;
  queryValue: string;
  rawResponse: Record<string, any>;
  verifiedStatus: ComplianceStatus;
  requestedBy: mongoose.Types.ObjectId;
  cachedUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

const complianceLogSchema = new Schema<IComplianceLog>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    queryType: {
      type: String,
      enum: COMPLIANCE_QUERY_TYPES,
      required: true,
      index: true
    },
    queryValue: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },
    rawResponse: {
      type: Schema.Types.Mixed,
      required: true
    },
    verifiedStatus: {
      type: String,
      enum: COMPLIANCE_STATUSES,
      required: true,
      index: true
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    cachedUntil: {
      type: Date,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

complianceLogSchema.index({ tenantId: 1, queryType: 1, queryValue: 1, createdAt: -1 });
complianceLogSchema.index({ tenantId: 1, cachedUntil: 1 });

complianceLogSchema.plugin(tenantPlugin);

export const ComplianceLog = mongoose.model<IComplianceLog>(
  'ComplianceLog',
  complianceLogSchema
);
