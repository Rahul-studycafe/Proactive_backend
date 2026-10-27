import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface IBillingEntity extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  entityName?: string;
  tradeName?: string;
  gstin?: string;
  pan?: string;
  cin?: string;
  address?: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifsc?: string;
    branch?: string;
  };
  upiId?: string;
  logoUrl?: string;
  signatureUrl?: string;
  signatoryUrl?: string;
  invoicePrefix: string;
  invoiceNextNumber: number;
  receiptPrefix: string;
  receiptNextNumber: number;
  termsAndConditions?: string;
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const billingEntitySchema = new Schema<IBillingEntity>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    name: { type: String, required: true },
    entityName: { type: String },
    tradeName: { type: String },
    gstin: { type: String },
    pan: { type: String },
    cin: { type: String },
    address: {
      addressLine1: { type: String },
      addressLine2: { type: String },
      city: { type: String },
      state: { type: String },
      country: { type: String, default: 'India' },
      pincode: { type: String }
    },
    bankDetails: {
      bankName: { type: String },
      accountNumber: { type: String },
      ifsc: { type: String },
      branch: { type: String }
    },
    upiId: { type: String },
    logoUrl: { type: String },
    signatureUrl: { type: String },
    signatoryUrl: { type: String },
    invoicePrefix: { type: String, default: 'INV/' },
    invoiceNextNumber: { type: Number, default: 1 },
    receiptPrefix: { type: String, default: 'RCT/' },
    receiptNextNumber: { type: Number, default: 1 },
    termsAndConditions: { type: String },
    isDefault: { type: Boolean, default: false }
  },
  { timestamps: true }
);

billingEntitySchema.pre('validate', async function () {
  if (this.entityName && !this.name) {
    this.name = this.entityName;
  }
  if (!this.name) {
    const Organization = mongoose.model('Organization');
    const org = (await Organization.findById(this.tenantId)) as any;
    if (org) {
      this.name = org.company || org.name;
      this.gstin = this.gstin || org.gstin;
      this.pan = this.pan || org.pan;
      if (org.address && !this.address) {
        this.address = org.address;
      }
    }
  }
  if (this.name && !this.entityName) {
    this.entityName = this.name;
  }
  if (this.signatureUrl && !this.signatoryUrl) {
    this.signatoryUrl = this.signatureUrl;
  }
});

billingEntitySchema.index({ tenantId: 1, name: 1 });
billingEntitySchema.plugin(tenantPlugin);

export const BillingEntity = mongoose.model<IBillingEntity>(
  'BillingEntity',
  billingEntitySchema
);
