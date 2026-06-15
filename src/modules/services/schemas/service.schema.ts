import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface IService extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  isEnabled: boolean;
  isRecurring: boolean;
  frequency?: {
    type: string;
    creationDay: number;
    dueDay: number;
    periodLogic: string;
  };
  assignmentMode: string;
  assignedUsers: mongoose.Types.ObjectId[];
  sacCode?: string;
  gstPercentage: number;
  defaultBillingRate: number;
  isBillable: boolean;
  checklist: {
    stepName: string;
    orderIndex: number;
  }[];
  subtasks: {
    title: string;
    description?: string;
    relativeDueDays?: number;
    assignedUserId?: mongoose.Types.ObjectId;
  }[];
  customFieldsDef: {
    label: string;
    fieldType: string;
    options?: string[];
    isRequired: boolean;
  }[];
  isChecklistRequired: boolean;
  gstApiConfig: {
    isEnabled: boolean;
    returnType?: string;
  };
  autoDocCollection: {
    isEnabled: boolean;
    defaultMessage?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const serviceSchema = new Schema<IService>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // Basic
  name: { type: String, required: true, trim: true },
  isEnabled: { type: Boolean, default: true },
  
  // Recurrence Configuration
  isRecurring: { type: Boolean, default: false },
  frequency: {
    type: { type: String, enum: ['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time'] },
    creationDay: { type: Number, min: 1, max: 28 },
    dueDay: { type: Number, min: 1, max: 28 },
    periodLogic: {
      type: String,
      enum: ['recently_completed', 'currently_running'],
      default: 'recently_completed'
    }
  },
  
  // Assignment Logic
  assignmentMode: {
    type: String,
    enum: ['client_default_user', 'specific_users'],
    default: 'client_default_user'
  },
  assignedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  
  // Billing Settings
  sacCode: { type: String },
  gstPercentage: { type: Number, default: 18 },
  defaultBillingRate: { type: Number, default: 0 },
  isBillable: { type: Boolean, default: true },
  
  // Checklist
  checklist: [{
    stepName: { type: String, required: true },
    orderIndex: { type: Number, required: true }
  }],
  
  // Subtasks
  subtasks: [{
    title: { type: String },
    description: { type: String },
    relativeDueDays: { type: Number },
    assignedUserId: { type: Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Custom Field Definitions
  customFieldsDef: [{
    label: { type: String, required: true },
    fieldType: { type: String, enum: ['text', 'number', 'select', 'date'], required: true },
    options: [{ type: String }],
    isRequired: { type: Boolean, default: false }
  }],
  
  // Checklist completion requirement
  isChecklistRequired: { type: Boolean, default: false },
  
  // GST API Config
  gstApiConfig: {
    isEnabled: { type: Boolean, default: false },
    returnType: { type: String }
  },
  
  // Document Collection toggle
  autoDocCollection: {
    isEnabled: { type: Boolean, default: false },
    defaultMessage: { type: String }
  }
}, { timestamps: true });

serviceSchema.index({ tenantId: 1, isEnabled: 1 });
serviceSchema.index({ tenantId: 1, isRecurring: 1, isEnabled: 1 });
serviceSchema.index({ tenantId: 1, name: 1 });

serviceSchema.plugin(tenantPlugin);

export const Service = mongoose.model<IService>('Service', serviceSchema);
