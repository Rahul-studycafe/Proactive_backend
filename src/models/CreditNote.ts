import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export const CREDIT_NOTE_REASONS = [
  'Overcharge Correction',
  'Service Cancellation',
  'Goodwill Discount',
  'Deficiency of Service',
  'Other'
] as const;

export const CREDIT_NOTE_STATUSES = ['Issued', 'Applied', 'Refunded', 'Cancelled'] as const;

export interface ICreditNoteItem {
  description: string;
  sacCode?: string;
  quantity: number;
  rate: number;
  amount: number;
  gstPercentage: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface ICreditNoteRefundDetails {
  refundDate: Date;
  refundMode: 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI' | 'Other';
  referenceNo?: string;
  refundedAmount: number;
  notes?: string;
}

export interface ICreditNote extends Document {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  invoiceId: mongoose.Types.ObjectId;
  creditNoteNo: string; // e.g. "CN-001"
  date: Date;
  reason: 'Overcharge Correction' | 'Service Cancellation' | 'Goodwill Discount' | 'Deficiency of Service' | 'Other';
  items: ICreditNoteItem[];
  totals: {
    subtotal: number;
    taxTotal: number;
    cgstTotal: number;
    sgstTotal: number;
    igstTotal: number;
    roundOff: number;
    grandTotal: number;
  };
  creditAppliedToInvoice: number; // Amount allocated immediately to the linked invoice
  unallocatedCredit: number; // Remaining amount if invoice had lower or zero balance due
  status: 'Issued' | 'Applied' | 'Refunded' | 'Cancelled';
  refundDetails?: ICreditNoteRefundDetails;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const creditNoteSchema = new Schema<ICreditNote>(
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
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true
    },
    creditNoteNo: {
      type: String,
      required: true,
      trim: true
    },
    date: {
      type: Date,
      required: true,
      index: true
    },
    reason: {
      type: String,
      enum: CREDIT_NOTE_REASONS,
      default: 'Overcharge Correction'
    },
    items: [
      {
        description: { type: String, required: true },
        sacCode: { type: String },
        quantity: { type: Number, default: 1 },
        rate: { type: Number, required: true },
        amount: { type: Number, required: true },
        gstPercentage: { type: Number, default: 18 },
        cgst: { type: Number, default: 0 },
        sgst: { type: Number, default: 0 },
        igst: { type: Number, default: 0 },
        total: { type: Number, required: true }
      }
    ],
    totals: {
      subtotal: { type: Number, required: true, default: 0 },
      taxTotal: { type: Number, required: true, default: 0 },
      cgstTotal: { type: Number, default: 0 },
      sgstTotal: { type: Number, default: 0 },
      igstTotal: { type: Number, default: 0 },
      roundOff: { type: Number, default: 0 },
      grandTotal: { type: Number, required: true, default: 0 }
    },
    creditAppliedToInvoice: {
      type: Number,
      required: true,
      default: 0
    },
    unallocatedCredit: {
      type: Number,
      required: true,
      default: 0
    },
    status: {
      type: String,
      enum: CREDIT_NOTE_STATUSES,
      default: 'Issued',
      index: true
    },
    refundDetails: {
      refundDate: { type: Date },
      refundMode: { type: String, enum: ['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'Other'] },
      referenceNo: { type: String },
      refundedAmount: { type: Number },
      notes: { type: String }
    },
    notes: {
      type: String,
      trim: true
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

// Unique compound index: creditNoteNo unique per tenant
creditNoteSchema.index({ tenantId: 1, creditNoteNo: 1 }, { unique: true });
creditNoteSchema.index({ tenantId: 1, clientId: 1, date: -1 });
creditNoteSchema.index({ tenantId: 1, invoiceId: 1 });
creditNoteSchema.index({ tenantId: 1, status: 1 });

creditNoteSchema.plugin(tenantPlugin);

export const CreditNote = mongoose.model<ICreditNote>('CreditNote', creditNoteSchema);
