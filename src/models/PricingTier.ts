import mongoose, { Schema, Document } from 'mongoose';

export interface IPricingTier extends Document {
  name: string;
  minUsers: number;
  maxUsers: number;
  pricePerUserMonthly: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const pricingTierSchema = new Schema<IPricingTier>({
  name: { type: String, required: true },
  minUsers: { type: Number, required: true },
  maxUsers: { type: Number, required: true },
  pricePerUserMonthly: { type: Number, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const PricingTier = mongoose.model<IPricingTier>('PricingTier', pricingTierSchema);
