import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export type PlanTier = 'Starter' | 'Professional' | 'Enterprise';
export type SubscriptionStatus = 'Active' | 'Past Due' | 'Cancelled';

export interface ITenantSubscription extends MongooseDocument {
  tenantId: mongoose.Types.ObjectId;
  planTier: PlanTier;
  billingCycle: 'Monthly' | 'Annual';
  maxUsers: number;
  maxClients: number;
  storageLimitGb: number;
  featuresEnabled: {
    clientPortal: boolean;
    timeTracking: boolean;
    multiBranch: boolean;
    customDomain: boolean;
    bulkWhatsApp: boolean;
  };
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  status: SubscriptionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSubscriptionSchema = new Schema<ITenantSubscription>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
      index: true
    },
    planTier: {
      type: String,
      enum: ['Starter', 'Professional', 'Enterprise'],
      default: 'Professional'
    },
    billingCycle: {
      type: String,
      enum: ['Monthly', 'Annual'],
      default: 'Annual'
    },
    maxUsers: {
      type: Number,
      default: 10
    },
    maxClients: {
      type: Number,
      default: 500
    },
    storageLimitGb: {
      type: Number,
      default: 25
    },
    featuresEnabled: {
      clientPortal: { type: Boolean, default: true },
      timeTracking: { type: Boolean, default: true },
      multiBranch: { type: Boolean, default: true },
      customDomain: { type: Boolean, default: false },
      bulkWhatsApp: { type: Boolean, default: false }
    },
    currentPeriodStart: {
      type: Date,
      default: Date.now
    },
    currentPeriodEnd: {
      type: Date,
      default: () => new Date(Date.now() + 365 * 86400 * 1000)
    },
    status: {
      type: String,
      enum: ['Active', 'Past Due', 'Cancelled'],
      default: 'Active',
      index: true
    }
  },
  { timestamps: true }
);

tenantSubscriptionSchema.plugin(tenantPlugin);

export const TenantSubscription = mongoose.model<ITenantSubscription>(
  'TenantSubscription',
  tenantSubscriptionSchema
);

