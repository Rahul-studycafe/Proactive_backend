import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface IInvoiceItem {
  referenceType: 'Task' | 'Expense' | 'Manual';
  referenceId?: mongoose.Types.ObjectId;
  particulars: string;
  sacCode?: string;
  quantity: number;
  rate: number;
  discount: number;
  taxableAmount: number;
  gstPercentage: number;
  gstAmount: number;
  total: number;
}

export interface IInvoice extends Document {
  tenantId: mongoose.Types.ObjectId;
  billingEntityId?: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  invoiceNo: string;
  date: Date;
  dueDate?: Date;
  paymentTerms?: string;
  items: IInvoiceItem[];
  totals: {
    subtotal: number;
    totalDiscount: number;
    totalTaxable: number;
    totalGst: number;
    roundOff: number;
    grandTotal: number;
    amountPaid: number;
    amountDue: number;
  };
  status: 'Draft' | 'Unpaid' | 'Partially Paid' | 'Paid' | 'Cancelled';
  notes?: string;
  termsAndConditions?: string;
  pdfUrl?: string;
  creditNoteIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema<IInvoice>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // References
  billingEntityId: { type: Schema.Types.ObjectId, ref: 'BillingEntity' },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
  
  // Invoice Identity
  invoiceNo: { type: String, required: true },
  date: { type: Date, required: true },
  dueDate: { type: Date },
  paymentTerms: { type: String },
  
  // Line Items
  items: [{
    referenceType: { type: String, enum: ['Task', 'Expense', 'Manual'], required: true },
    referenceId: { type: Schema.Types.ObjectId },
    particulars: { type: String, required: true },
    sacCode: { type: String },
    quantity: { type: Number, default: 1 },
    rate: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    taxableAmount: { type: Number, required: true },
    gstPercentage: { type: Number, default: 18 },
    gstAmount: { type: Number, required: true },
    total: { type: Number, required: true }
  }],
  
  // Totals
  totals: {
    subtotal: { type: Number, required: true },
    totalDiscount: { type: Number, default: 0 },
    totalTaxable: { type: Number, required: true },
    totalGst: { type: Number, required: true },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    amountDue: { type: Number, required: true }
  },
  
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Unpaid', 'Partially Paid', 'Paid', 'Cancelled'],
    default: 'Unpaid'
  },
  
  // Notes
  notes: { type: String },
  termsAndConditions: { type: String },
  
  // PDF
  pdfUrl: { type: String },
  
  // Credit Notes
  creditNoteIds: [{ type: Schema.Types.ObjectId, ref: 'CreditNote' }]
}, { timestamps: true });

invoiceSchema.index({ tenantId: 1, invoiceNo: 1 }, { unique: true });
invoiceSchema.index({ tenantId: 1, clientId: 1, status: 1 });
invoiceSchema.index({ tenantId: 1, status: 1 });
invoiceSchema.index({ tenantId: 1, date: -1 });

invoiceSchema.plugin(tenantPlugin);

// POST SAVE HOOK: Mark referenced tasks/expenses as billed (Req 7.1)
invoiceSchema.post('save', async function (doc) {
  if (doc.status !== 'Draft' && doc.status !== 'Cancelled') {
    const taskIds = doc.items
      .filter(i => i.referenceType === 'Task' && i.referenceId)
      .map(i => i.referenceId as mongoose.Types.ObjectId);
    
    if (taskIds.length > 0) {
      // Need to require Task model dynamically to avoid circular dependencies if any
      const Task = mongoose.model('Task');
      await Task.updateMany(
        { _id: { $in: taskIds } },
        { $set: { isBilled: true, invoiceId: doc._id } }
      );
    }
  }
});

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
