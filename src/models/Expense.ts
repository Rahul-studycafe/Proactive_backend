import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export type ExpensePaymentMode = 'Bank Transfer' | 'Cash' | 'UPI' | 'Credit Card' | 'Cheque';

export interface IExpense extends Document {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  taskId?: mongoose.Types.ObjectId;
  expenseNo: string;
  date: Date;
  categoryId: mongoose.Types.ObjectId;
  categoryName: string;
  amount: number;
  paymentMode: ExpensePaymentMode;
  paidFromAccount?: string;
  notes?: string;
  receiptFileUrl?: string;
  receiptFileName?: string;
  isBilled: boolean;
  invoiceId?: mongoose.Types.ObjectId;
  billedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpense>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task'
    },
    expenseNo: {
      type: String,
      required: true,
      trim: true
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'ExpenseCategory',
      required: true
    },
    categoryName: {
      type: String,
      required: true,
      trim: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    paymentMode: {
      type: String,
      enum: ['Bank Transfer', 'Cash', 'UPI', 'Credit Card', 'Cheque'],
      required: true,
      default: 'Bank Transfer'
    },
    paidFromAccount: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    },
    receiptFileUrl: {
      type: String,
      trim: true
    },
    receiptFileName: {
      type: String,
      trim: true
    },
    isBilled: {
      type: Boolean,
      default: false,
      index: true
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      index: true
    },
    billedAt: {
      type: Date
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Multi-tenant indexes
expenseSchema.index({ tenantId: 1, clientId: 1, isBilled: 1 });
expenseSchema.index({ tenantId: 1, date: -1 });
expenseSchema.index({ tenantId: 1, invoiceId: 1 });
expenseSchema.index({ tenantId: 1, expenseNo: 1 }, { unique: true });

expenseSchema.plugin(tenantPlugin);

export const Expense = mongoose.model<IExpense>('Expense', expenseSchema);
