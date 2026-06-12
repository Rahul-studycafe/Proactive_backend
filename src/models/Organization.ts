import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  slug: string;
  ownerId?: mongoose.Types.ObjectId;
  plan: {
    type: 'free' | 'starter' | 'professional' | 'enterprise';
    maxUsers: number;
    expiresAt?: Date;
    razorpaySubscriptionId?: string;
  };
  email?: string;
  phone?: string;
  address?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>({
  name: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true },
  
  ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
  
  plan: {
    type: { type: String, enum: ['free', 'starter', 'professional', 'enterprise'], default: 'free' },
    maxUsers: { type: Number, default: 2 },
    expiresAt: { type: Date },
    razorpaySubscriptionId: { type: String }
  },
  
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const Organization = mongoose.model<IOrganization>('Organization', organizationSchema);
