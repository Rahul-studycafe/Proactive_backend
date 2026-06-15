import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface IDocumentType extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const documentTypeSchema = new Schema<IDocumentType>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

documentTypeSchema.index({ tenantId: 1, name: 1 }, { unique: true });
documentTypeSchema.plugin(tenantPlugin);

export const DocumentType = mongoose.model<IDocumentType>('DocumentType', documentTypeSchema);
