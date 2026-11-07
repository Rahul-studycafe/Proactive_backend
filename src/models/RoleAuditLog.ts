import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface IRoleAuditLog extends Document {
  tenantId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  actorEmail: string;
  action:
    | 'ROLE_CREATED'
    | 'ROLE_UPDATED'
    | 'ROLE_DELETED'
    | 'ROLE_ASSIGNED'
    | 'ROLE_REVOKED';
  targetRoleId?: mongoose.Types.ObjectId;
  targetRoleName: string;
  targetUserId?: mongoose.Types.ObjectId;
  targetUserName?: string;
  changes?: {
    addedPermissions?: string[];
    removedPermissions?: string[];
    scopeChanges?: Record<string, string>;
  };
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const roleAuditLogSchema = new Schema<IRoleAuditLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorEmail: { type: String, required: true },
    action: {
      type: String,
      enum: [
        'ROLE_CREATED',
        'ROLE_UPDATED',
        'ROLE_DELETED',
        'ROLE_ASSIGNED',
        'ROLE_REVOKED'
      ],
      required: true
    },
    targetRoleId: { type: Schema.Types.ObjectId, ref: 'Role' },
    targetRoleName: { type: String, required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    targetUserName: { type: String },
    changes: {
      addedPermissions: [{ type: String }],
      removedPermissions: [{ type: String }],
      scopeChanges: { type: Schema.Types.Mixed }
    },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  { timestamps: true }
);

roleAuditLogSchema.index({ tenantId: 1, createdAt: -1 });
roleAuditLogSchema.index({ tenantId: 1, action: 1 });
roleAuditLogSchema.index({ tenantId: 1, targetRoleId: 1 });

roleAuditLogSchema.plugin(tenantPlugin);

export const RoleAuditLog = mongoose.model<IRoleAuditLog>('RoleAuditLog', roleAuditLogSchema);

