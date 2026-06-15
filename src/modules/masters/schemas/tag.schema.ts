import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface ITag extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  color: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tagSchema = new Schema<ITag>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#3B82F6' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

tagSchema.index({ tenantId: 1, name: 1 }, { unique: true });
tagSchema.plugin(tenantPlugin);

export const Tag = mongoose.model<ITag>('Tag', tagSchema);
