import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export type PaymentProvider = 'Razorpay' | 'Cashfree' | 'UPI_Direct';
export type PaymentMode = 'UPI' | 'CreditCard' | 'DebitCard' | 'NetBanking';

export interface IPaymentGatewayConfig extends MongooseDocument {
  tenantId: mongoose.Types.ObjectId;
  billingEntityId?: mongoose.Types.ObjectId;
  provider: PaymentProvider;
  isEnabled: boolean;
  keyId: string;
  encryptedKeySecret?: string;
  iv?: string;
  webhookSecret?: string;
  upiVpa?: string;
  merchantName?: string;
  acceptedModes: PaymentMode[];
  createdAt: Date;
  updatedAt: Date;
}

const paymentGatewayConfigSchema = new Schema<IPaymentGatewayConfig>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    billingEntityId: {
      type: Schema.Types.ObjectId,
      ref: 'BillingEntity'
    },
    provider: {
      type: String,
      enum: ['Razorpay', 'Cashfree', 'UPI_Direct'],
      required: true
    },
    isEnabled: {
      type: Boolean,
      default: true
    },
    keyId: {
      type: String,
      default: ''
    },
    encryptedKeySecret: {
      type: String
    },
    iv: {
      type: String
    },
    webhookSecret: {
      type: String
    },
    upiVpa: {
      type: String,
      trim: true
    },
    merchantName: {
      type: String,
      trim: true
    },
    acceptedModes: {
      type: [String],
      enum: ['UPI', 'CreditCard', 'DebitCard', 'NetBanking'],
      default: ['UPI']
    }
  },
  { timestamps: true }
);

paymentGatewayConfigSchema.index({ tenantId: 1, provider: 1, billingEntityId: 1 }, { unique: true });
paymentGatewayConfigSchema.plugin(tenantPlugin);

export const PaymentGatewayConfig = mongoose.model<IPaymentGatewayConfig>(
  'PaymentGatewayConfig',
  paymentGatewayConfigSchema
);

