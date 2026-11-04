import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface IUser extends Document {
  tenantId: mongoose.Types.ObjectId;
  platformUserId?: mongoose.Types.ObjectId;
  name: string;
  username: string;
  email?: string;
  mobile?: string;
  password?: string;
  photoUrl?: string;
  roleId: mongoose.Types.ObjectId;
  isOwner: boolean;
  departmentId?: mongoose.Types.ObjectId;
  managerId?: mongoose.Types.ObjectId;
  invitationStatus: 'active' | 'invited' | 'pending';
  invitationToken?: string;
  invitationExpiresAt?: Date;
  isActive: boolean;
  joiningDate?: Date;
  tokenVersion: number;
  refreshToken?: string;
  createdBy?: mongoose.Types.ObjectId;
  comparePassword: (candidatePassword: string) => Promise<boolean>;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  platformUserId: { type: Schema.Types.ObjectId, ref: 'PlatformUser', index: true, sparse: true },
  
  // Identity
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, trim: true, lowercase: true },
  email: { type: String, trim: true, lowercase: true },
  mobile: { type: String, trim: true },
  password: { type: String, select: false },  // Optional for invited users until activation
  
  // Profile
  photoUrl: { type: String, default: '' },
  
  // Access Control & Organization
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  isOwner: { type: Boolean, default: false },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  managerId: { type: Schema.Types.ObjectId, ref: 'User' },
  invitationStatus: { type: String, enum: ['active', 'invited', 'pending'], default: 'active' },
  invitationToken: { type: String, select: false },
  invitationExpiresAt: { type: Date },
  isActive: { type: Boolean, default: true },
  joiningDate: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Security — JWT Invalidation
  tokenVersion: { type: Number, default: 0 },
  
  // Refresh token storage (hashed)
  refreshToken: { type: String, select: false }
}, { timestamps: true });

// Compound unique: username and email unique per tenant
userSchema.index({ tenantId: 1, username: 1 }, { unique: true });
userSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
userSchema.index({ tenantId: 1, isActive: 1 });
userSchema.index({ tenantId: 1, isOwner: 1 });

// Password hashing hook
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password as string, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.plugin(tenantPlugin);

export const User = mongoose.model<IUser>('User', userSchema);
