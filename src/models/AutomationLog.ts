import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface IAutomationLogDetail {
  clientId: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;
  period: string;
  status: 'Created' | 'Skipped' | 'Failed';
  reason?: string;
}

export interface IAutomationLog extends Document {
  tenantId: mongoose.Types.ObjectId;
  runType: 'Cron' | 'Manual';
  triggeredBy?: mongoose.Types.ObjectId;
  startedAt: Date;
  completedAt: Date;
  tasksCreatedCount: number;
  tasksSkippedCount: number;
  errorCount: number;
  details: IAutomationLogDetail[];
  createdAt: Date;
  updatedAt: Date;
}

const automationLogDetailSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    period: { type: String, required: true },
    status: { type: String, enum: ['Created', 'Skipped', 'Failed'], required: true },
    reason: { type: String }
  },
  { _id: false }
);

const automationLogSchema = new Schema<IAutomationLog>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    runType: {
      type: String,
      enum: ['Cron', 'Manual'],
      default: 'Manual',
      required: true
    },
    triggeredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    startedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    completedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    tasksCreatedCount: {
      type: Number,
      default: 0
    },
    tasksSkippedCount: {
      type: Number,
      default: 0
    },
    errorCount: {
      type: Number,
      default: 0
    },
    details: [automationLogDetailSchema]
  },
  {
    timestamps: true
  }
);

automationLogSchema.index({ tenantId: 1, createdAt: -1 });
// Auto-expire logs older than 90 days to prevent unbounded database growth
automationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
automationLogSchema.plugin(tenantPlugin);

export const AutomationLog = mongoose.model<IAutomationLog>(
  'AutomationLog',
  automationLogSchema
);
