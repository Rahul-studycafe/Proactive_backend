import mongoose, { Schema, Document } from 'mongoose';

export interface IBillingEntity extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  gstin?: string;
  pan?: string;
  address?: string;
  logoUrl?: string;
  signatureUrl?: string;
  invoicePrefix: string;
  invoiceNextNumber: number;
  receiptPrefix: string;
  receiptNextNumber: number;
  termsAndConditions?: string;
  createdAt: Date;
  updatedAt: Date;
}

const billingEntitySchema = new Schema<IBillingEntity>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  name: { type: String, required: true },
  gstin: { type: String },
  pan: { type: String },
  address: { type: String },
  
  // Brand Assets
  logoUrl: { type: String },
  signatureUrl: { type: String },
  
  // Invoice Sequencing
  invoicePrefix: { type: String, default: 'INV-' },
  invoiceNextNumber: { type: Number, default: 1 },
  receiptPrefix: { type: String, default: 'RCT-' },
  receiptNextNumber: { type: Number, default: 1 },
  
  // Footer
  termsAndConditions: { type: String }
}, { timestamps: true });

export const BillingEntity = mongoose.model<IBillingEntity>('BillingEntity', billingEntitySchema);
