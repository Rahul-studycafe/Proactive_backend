import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface IDocument extends MongooseDocument {
  tenantId: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  category: 'document' | 'supporting_file';
  fileName: string;
  fileUrl: string;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  category: { type: String, enum: ['document', 'supporting_file'], required: true },
  fileName: { type: String, required: true },
  fileUrl: { type: String, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

documentSchema.plugin(tenantPlugin);

export const DocumentModel = mongoose.model<IDocument>('Document', documentSchema);
