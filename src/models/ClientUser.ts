import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface IClientUser extends Document {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  password?: string;
  isPrimaryContact: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  otpSecret?: {
    code: string;
    expiresAt: Date;
    attempts: number;
  };
  magicLinkToken?: string;
  magicLinkExpiresAt?: Date;
  tokenVersion: number;
  comparePassword: (candidatePassword: string) => Promise<boolean>;
  createdAt: Date;
  updatedAt: Date;
}

const clientUserSchema = new Schema<IClientUser>(
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
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    password: {
      type: String,
      select: false
    },
    isPrimaryContact: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLoginAt: {
      type: Date
    },
    otpSecret: {
      code: { type: String },
      expiresAt: { type: Date },
      attempts: { type: Number, default: 0 }
    },
    magicLinkToken: {
      type: String,
      sparse: true,
      index: true
    },
    magicLinkExpiresAt: {
      type: Date
    },
    tokenVersion: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
clientUserSchema.index({ tenantId: 1, email: 1 });
clientUserSchema.index({ tenantId: 1, phone: 1 });
clientUserSchema.index({ tenantId: 1, clientId: 1 });

// Password hashing pre-save hook
clientUserSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Instance method to compare password
clientUserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

clientUserSchema.plugin(tenantPlugin);

export const ClientUser = mongoose.model<IClientUser>('ClientUser', clientUserSchema);
