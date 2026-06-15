import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface IExpenseCategory extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const expenseCategorySchema = new Schema<IExpenseCategory>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

expenseCategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });
expenseCategorySchema.plugin(tenantPlugin);

export const ExpenseCategory = mongoose.model<IExpenseCategory>('ExpenseCategory', expenseCategorySchema);
