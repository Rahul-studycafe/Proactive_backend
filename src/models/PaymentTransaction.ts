import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export type PaymentTransactionStatus = 'Initiated' | 'Captured' | 'Failed' | 'Refunded';

export interface IPaymentTransaction extends MongooseDocument {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  invoiceId: mongoose.Types.ObjectId;
  receiptId?: mongoose.Types.ObjectId;
  gatewayProvider: string;
  gatewayTransactionId: string;
  gatewayOrderId?: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: PaymentTransactionStatus;
  errorCode?: string;
  errorDescription?: string;
  rawWebhookPayload?: any;
  createdAt: Date;
  updatedAt: Date;
}

const paymentTransactionSchema = new Schema<IPaymentTransaction>(
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
    receiptId: {
      type: Schema.Types.ObjectId,
      ref: 'Receipt'
    },
    gatewayProvider: {
      type: String,
      required: true
    },
    gatewayTransactionId: {
      type: String,
      required: true,
      trim: true
    },
    gatewayOrderId: {
      type: String,
      trim: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    currency: {
      type: String,
      default: 'INR'
    },
    paymentMethod: {
      type: String,
      default: 'UPI'
    },
    status: {
      type: String,
      enum: ['Initiated', 'Captured', 'Failed', 'Refunded'],
      default: 'Initiated',
      index: true
    },
    errorCode: {
      type: String
    },
    errorDescription: {
      type: String
    },
    rawWebhookPayload: {
      type: Schema.Types.Mixed
    }
  },
  { timestamps: true }
);

paymentTransactionSchema.index({ tenantId: 1, gatewayTransactionId: 1 }, { unique: true });
paymentTransactionSchema.index({ tenantId: 1, clientId: 1, status: 1 });
paymentTransactionSchema.index({ tenantId: 1, invoiceId: 1 });

paymentTransactionSchema.plugin(tenantPlugin);

export const PaymentTransaction = mongoose.model<IPaymentTransaction>(
  'PaymentTransaction',
  paymentTransactionSchema
);

