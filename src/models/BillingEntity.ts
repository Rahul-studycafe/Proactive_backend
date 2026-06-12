import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface IBillingEntity extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  gstin?: string;
  pan?: string;
  address?: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
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
  address: {
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    pincode: { type: String }
  },
  
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

billingEntitySchema.pre('validate', async function () {
  const Organization = mongoose.model('Organization');
  const org = await Organization.findById(this.tenantId) as any;
  if (org) {
    // Take values from organization schema to ensure they are not different
    this.name = org.company || org.name;
    this.gstin = org.gstin;
    this.pan = org.pan;
    if (org.address) {
      this.address = org.address;
    }
  }
});

billingEntitySchema.plugin(tenantPlugin);

export const BillingEntity = mongoose.model<IBillingEntity>('BillingEntity', billingEntitySchema);
