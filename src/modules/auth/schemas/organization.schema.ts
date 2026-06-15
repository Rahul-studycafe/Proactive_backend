import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  company?: string;
  slug: string;
  ownerId?: mongoose.Types.ObjectId;
  subscriptionStatus?: 'trial' | 'active' | 'past_due' | 'canceled';
  subscriptionDuration?: 'monthly' | 'yearly';
  renewalDate?: Date;
  plan: {
    maxUsers: number;
    razorpaySubscriptionId?: string;
  };
  email?: string;
  phone?: string;
  gstin?: string;
  pan?: string;
  address?: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    country: string;
    pincode: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>({
  name: { type: String, required: true, trim: true },
  company: { type: String, trim: true },
  slug: { type: String, unique: true, lowercase: true },
  
  ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
  
  subscriptionStatus: { type: String, enum: ['trial', 'active', 'past_due', 'canceled'], default: 'trial' },
  subscriptionDuration: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  renewalDate: { type: Date },
  
  plan: {
    maxUsers: { type: Number, default: 5 },
    razorpaySubscriptionId: { type: String }
  },
  
  email: { type: String },
  phone: { type: String },
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
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const Organization = mongoose.model<IOrganization>('Organization', organizationSchema);
