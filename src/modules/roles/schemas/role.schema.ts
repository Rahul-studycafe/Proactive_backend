import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export type ScopeType = 'everything' | 'assigned_only' | 'team_only';

export interface IPermissionAction {
  allowed: boolean;
  scope: ScopeType;
}

export interface IRole extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isSuperAdmin: boolean;
  isSystemDefault: boolean; // Protects built-in blueprint roles (Admin, Accountant, Staff) from deletion
  permissions: Record<string, any>; // Dynamic map: supports "resource:action" and legacy nested schemas
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRole>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  isSuperAdmin: { type: Boolean, default: false },
  isSystemDefault: { type: Boolean, default: false },
  permissions: {
    type: Schema.Types.Mixed,
    default: {}
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, minimize: false });

roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
roleSchema.index({ tenantId: 1, isSuperAdmin: 1 });
roleSchema.index({ tenantId: 1, isSystemDefault: 1 });

roleSchema.plugin(tenantPlugin);

export const Role = mongoose.model<IRole>('Role', roleSchema);
