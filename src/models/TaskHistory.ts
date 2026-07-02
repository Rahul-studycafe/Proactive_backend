import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface ITaskHistory extends Document {
  tenantId: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  action: string;
  details?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const taskHistorySchema = new Schema<ITaskHistory>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
  action: { type: String, required: true },
  details: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

taskHistorySchema.plugin(tenantPlugin);

export const TaskHistory = mongoose.model<ITaskHistory>('TaskHistory', taskHistorySchema);
