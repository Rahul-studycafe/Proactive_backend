import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface IPaymentMode extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const paymentModeSchema = new Schema<IPaymentMode>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

paymentModeSchema.index({ tenantId: 1, name: 1 }, { unique: true });
paymentModeSchema.plugin(tenantPlugin);

export const PaymentMode = mongoose.model<IPaymentMode>('PaymentMode', paymentModeSchema);
