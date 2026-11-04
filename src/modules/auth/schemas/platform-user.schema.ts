import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IPlatformUser extends Document {
  name: string;
  email: string;
  mobile?: string;
  password?: string;
  isEmailVerified: boolean;
  emailVerifiedAt?: Date;
  status: 'active' | 'suspended' | 'deleted';
  tokenVersion: number;
  refreshToken?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword: (candidatePassword: string) => Promise<boolean>;
}

const platformUserSchema = new Schema<IPlatformUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    mobile: { type: String, trim: true },
    password: { type: String, required: true, select: false },
    isEmailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },
    status: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
    tokenVersion: { type: Number, default: 0 },
    refreshToken: { type: String, select: false },
    lastLoginAt: { type: Date }
  },
  { timestamps: true }
);

platformUserSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

platformUserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export const PlatformUser = mongoose.model<IPlatformUser>('PlatformUser', platformUserSchema);

