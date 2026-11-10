import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface ITenantConfiguration extends Document {
  tenantId: mongoose.Types.ObjectId;
  categoryKey: string;
  value: string;
  label: string;
  description?: string;
  color?: string | null;
  metadata?: Record<string, any>;
  sortOrder: number;
  isActive: boolean;
  isSystemDefault: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: mongoose.Types.ObjectId | null;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const tenantConfigurationSchema = new Schema<ITenantConfiguration>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    categoryKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isSystemDefault: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'tenant_configurations',
  }
);

// Compound indexes
tenantConfigurationSchema.index(
  { tenantId: 1, categoryKey: 1, value: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

tenantConfigurationSchema.index(
  { tenantId: 1, categoryKey: 1, label: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
    collation: { locale: 'en', strength: 2 },
  }
);

tenantConfigurationSchema.index({ tenantId: 1, categoryKey: 1, isDeleted: 1, isActive: 1, sortOrder: 1 });

tenantConfigurationSchema.plugin(tenantPlugin);

export const TenantConfiguration = mongoose.model<ITenantConfiguration>(
  'TenantConfiguration',
  tenantConfigurationSchema
);

