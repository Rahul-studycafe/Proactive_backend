import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

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
  permissions: {
    client: {
      create: IPermissionAction;
      edit: IPermissionAction;
      view: IPermissionAction;
      delete: IPermissionAction;
      viewLedger: IPermissionAction;
      manageClientPackages: IPermissionAction;
      viewClientPackages: IPermissionAction;
    };
    task: {
      create: IPermissionAction;
      edit: IPermissionAction;
      view: IPermissionAction;
      delete: IPermissionAction;
      verify: IPermissionAction;
      assignToOthers: IPermissionAction;
      manageTimeLog: IPermissionAction;
      deleteNote: IPermissionAction;
    };
    invoice: {
      create: IPermissionAction;
      edit: IPermissionAction;
      view: IPermissionAction;
      delete: IPermissionAction;
    };
    receipt: {
      create: IPermissionAction;
      edit: IPermissionAction;
      view: IPermissionAction;
      delete: IPermissionAction;
    };
    quotation: {
      create: IPermissionAction;
      edit: IPermissionAction;
      view: IPermissionAction;
      delete: IPermissionAction;
    };
    expense: {
      create: IPermissionAction;
      edit: IPermissionAction;
      view: IPermissionAction;
      delete: IPermissionAction;
    };
    docsInOut: {
      create: IPermissionAction;
      edit: IPermissionAction;
      view: IPermissionAction;
      delete: IPermissionAction;
    };
    dsc: {
      create: IPermissionAction;
      edit: IPermissionAction;
      view: IPermissionAction;
      delete: IPermissionAction;
    };
    attendance: {
      markAttendance: IPermissionAction;
      markPastFuture: IPermissionAction;
    };
    todo: {
      assignToOthers: IPermissionAction;
    };
    settings: {
      manageMasters: IPermissionAction;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const SCOPES = ['everything', 'assigned_only', 'team_only'];

const permissionActionSchema = {
  allowed: { type: Boolean, default: false },
  scope: { type: String, enum: SCOPES, default: 'everything' }
};

const roleSchema = new Schema<IRole>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String },
  isSuperAdmin: { type: Boolean, default: false },
  permissions: {
    client: {
      create: permissionActionSchema,
      edit: permissionActionSchema,
      view: permissionActionSchema,
      delete: permissionActionSchema,
      viewLedger: permissionActionSchema,
      manageClientPackages: permissionActionSchema,
      viewClientPackages: permissionActionSchema
    },
    task: {
      create: permissionActionSchema,
      edit: permissionActionSchema,
      view: permissionActionSchema,
      delete: permissionActionSchema,
      verify: permissionActionSchema,
      assignToOthers: permissionActionSchema,
      manageTimeLog: permissionActionSchema,
      deleteNote: permissionActionSchema
    },
    invoice: {
      create: permissionActionSchema,
      edit: permissionActionSchema,
      view: permissionActionSchema,
      delete: permissionActionSchema
    },
    receipt: {
      create: permissionActionSchema,
      edit: permissionActionSchema,
      view: permissionActionSchema,
      delete: permissionActionSchema
    },
    quotation: {
      create: permissionActionSchema,
      edit: permissionActionSchema,
      view: permissionActionSchema,
      delete: permissionActionSchema
    },
    expense: {
      create: permissionActionSchema,
      edit: permissionActionSchema,
      view: permissionActionSchema,
      delete: permissionActionSchema
    },
    docsInOut: {
      create: permissionActionSchema,
      edit: permissionActionSchema,
      view: permissionActionSchema,
      delete: permissionActionSchema
    },
    dsc: {
      create: permissionActionSchema,
      edit: permissionActionSchema,
      view: permissionActionSchema,
      delete: permissionActionSchema
    },
    attendance: {
      markAttendance: permissionActionSchema,
      markPastFuture: permissionActionSchema
    },
    todo: {
      assignToOthers: permissionActionSchema
    },
    settings: {
      manageMasters: permissionActionSchema
    }
  }
}, { timestamps: true });

roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

roleSchema.plugin(tenantPlugin);

export const Role = mongoose.model<IRole>('Role', roleSchema);
