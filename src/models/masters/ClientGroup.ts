import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../plugins/tenantPlugin';

export interface IClientGroup extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const clientGroupSchema = new Schema<IClientGroup>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

clientGroupSchema.index({ tenantId: 1, name: 1 }, { unique: true });
clientGroupSchema.plugin(tenantPlugin);

export const ClientGroup = mongoose.model<IClientGroup>('ClientGroup', clientGroupSchema);
