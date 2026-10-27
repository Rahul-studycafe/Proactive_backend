import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export type QuotationStatus = 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Converted';

export interface IQuotationItem {
  serviceId?: mongoose.Types.ObjectId;
  description: string;
  sacCode?: string;
  rate: number;
  quantity: number;
  amount: number;
  discount: number;
  taxableAmount: number;
  gstPercentage: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface IQuotationTotals {
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
}

export interface IQuotation extends Document {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  billingEntityId?: mongoose.Types.ObjectId;
  quotationNo: string;
  date: Date;
  validUntil: Date;
  items: IQuotationItem[];
  totals: IQuotationTotals;
  termsAndConditions?: string;
  notes?: string;
  status: QuotationStatus;
  sentAt?: Date;
  convertedInvoiceId?: mongoose.Types.ObjectId;
  convertedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const quotationItemSchema = new Schema<IQuotationItem>(
  {
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: 'Service'
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    sacCode: {
      type: String,
      trim: true
    },
    rate: {
      type: Number,
      required: true,
      min: 0
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01,
      default: 1
    },
    amount: {
      type: Number,
      required: true
    },
    discount: {
      type: Number,
      default: 0
    },
    taxableAmount: {
      type: Number,
      required: true
    },
    gstPercentage: {
      type: Number,
      default: 18,
      min: 0
    },
    cgst: {
      type: Number,
      default: 0
    },
    sgst: {
      type: Number,
      default: 0
    },
    igst: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);

const quotationTotalsSchema = new Schema<IQuotationTotals>(
  {
    subtotal: { type: Number, required: true },
    discountTotal: { type: Number, default: 0 },
    taxableTotal: { type: Number, required: true },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    taxTotal: { type: Number, required: true },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true }
  },
  { _id: false }
);

const quotationSchema = new Schema<IQuotation>(
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
    billingEntityId: {
      type: Schema.Types.ObjectId,
      ref: 'BillingEntity'
    },
    quotationNo: {
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
    validUntil: {
      type: Date,
      required: true
    },
    items: {
      type: [quotationItemSchema],
      required: true,
      validate: [(val: IQuotationItem[]) => val.length > 0, 'At least one item is required']
    },
    totals: {
      type: quotationTotalsSchema,
      required: true
    },
    termsAndConditions: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Accepted', 'Declined', 'Converted'],
      default: 'Draft',
      index: true
    },
    sentAt: {
      type: Date
    },
    convertedInvoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      index: true
    },
    convertedAt: {
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

// Indexes
quotationSchema.index({ tenantId: 1, clientId: 1, status: 1 });
quotationSchema.index({ tenantId: 1, date: -1 });
quotationSchema.index({ tenantId: 1, quotationNo: 1 }, { unique: true });

quotationSchema.plugin(tenantPlugin);

export const Quotation = mongoose.model<IQuotation>('Quotation', quotationSchema);
