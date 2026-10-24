import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface IReceiptSettlement {
  invoiceId: mongoose.Types.ObjectId;
  settledAmount: number;
  tdsDeducted?: number;
}

export interface IReceipt extends Document {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  receiptNo: string;
  date: Date;
  paymentMode: 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI' | 'Other';
  referenceNumber?: string;
  totalAmount: number;
  tdsAmount: number;
  discountAmount: number;
  notes?: string;
  settlements: IReceiptSettlement[];
  unallocatedAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const receiptSettlementSchema = new Schema<IReceiptSettlement>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    settledAmount: { type: Number, required: true, min: 0.01 },
    tdsDeducted: { type: Number, default: 0 }
  },
  { _id: false }
);

const receiptSchema = new Schema<IReceipt>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    receiptNo: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now },
    paymentMode: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'Other'],
      default: 'Bank Transfer'
    },
    referenceNumber: { type: String },
    totalAmount: { type: Number, required: true, min: 0.01 },
    tdsAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    notes: { type: String },
    settlements: [receiptSettlementSchema],
    unallocatedAmount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

receiptSchema.index({ tenantId: 1, receiptNo: 1 }, { unique: true });
receiptSchema.index({ tenantId: 1, clientId: 1, date: -1 });
receiptSchema.index({ tenantId: 1, date: -1 });

receiptSchema.plugin(tenantPlugin);

export const Receipt = mongoose.model<IReceipt>('Receipt', receiptSchema);
