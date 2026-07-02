import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export const TASK_STATUSES = ['Pending', 'In Progress', 'Under Review', 'On Hold', 'Completed', 'Cancelled'] as const;

export interface ITask extends Document {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;
  assigneeIds: mongoose.Types.ObjectId[];
  description?: string;
  status: string;
  priority: string;
  period?: {
    month?: number;
    year?: number;
    label?: string;
  };
  dueDate?: Date;
  targetDate?: Date;
  completedAt?: Date;
  creationType: string;
  checklist: {
    stepName: string;
    isCompleted: boolean;
    completedAt?: Date;
    completedBy?: mongoose.Types.ObjectId;
  }[];
  subtasks: {
    title: string;
    description?: string;
    assignedUserId?: mongoose.Types.ObjectId;
    dueDate?: Date;
    status: string;
  }[];
  customFieldValues: Map<string, any>;

  isBilled: boolean;
  invoiceId?: mongoose.Types.ObjectId;
  isBillable: boolean;
  billableAmount?: number;
  tags: string[];
  docCollectionRequest: boolean;
  docCollectionMessage?: string;
  billingAmount: number;
  timeLogged: number;
  timeLogs: {
    userId: mongoose.Types.ObjectId;
    minutes: number;
    description?: string;
    loggedAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // References
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  assigneeIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  
  // Task Details
  description: { type: String },
  status: { type: String, enum: TASK_STATUSES, default: 'Pending' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
  
  // Period
  period: {
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number },
    label: { type: String }
  },
  
  // Dates
  dueDate: { type: Date },
  targetDate: { type: Date },
  completedAt: { type: Date },
  
  // Creation context
  creationType: { type: String, enum: ['manual', 'automated'], default: 'manual' },
  
  // Checklist
  checklist: [{
    stepName: { type: String },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Subtasks
  subtasks: [{
    title: { type: String },
    description: { type: String },
    assignedUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    dueDate: { type: Date },
    status: { type: String, enum: TASK_STATUSES, default: 'Pending' }
  }],
  
  // Custom Field Values
  customFieldValues: { type: Map, of: Schema.Types.Mixed, default: {} },
  

  
  // Financial
  isBilled: { type: Boolean, default: false },
  invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
  isBillable: { type: Boolean, default: false },
  billableAmount: { type: Number },
  tags: [{ type: String }],
  docCollectionRequest: { type: Boolean, default: false },
  docCollectionMessage: { type: String },
  billingAmount: { type: Number, default: 0 },
  
  // Time Tracking
  timeLogged: { type: Number, default: 0 },
  timeLogs: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    minutes: { type: Number },
    description: { type: String },
    loggedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

taskSchema.index({ tenantId: 1, status: 1 });
taskSchema.index({ tenantId: 1, clientId: 1, status: 1 });
taskSchema.index({ tenantId: 1, assignedUserId: 1, status: 1 });
taskSchema.index({ tenantId: 1, isBilled: 1, status: 1 });
taskSchema.index({ tenantId: 1, serviceId: 1, clientId: 1, 'period.month': 1, 'period.year': 1 });
taskSchema.index({ tenantId: 1, dueDate: 1 });

taskSchema.plugin(tenantPlugin);

export const Task = mongoose.model<ITask>('Task', taskSchema);
