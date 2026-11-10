import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export interface IDocument extends MongooseDocument {
  tenantId: mongoose.Types.ObjectId;
  taskId?: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  category: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy?: mongoose.Types.ObjectId;
  uploadedByModel?: 'User' | 'ClientUser';
  clientUserId?: mongoose.Types.ObjectId;
  source?: 'staff' | 'portal_client_upload' | 'magic_link';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', index: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  category: { type: String, default: 'document' },
  fileName: { type: String, required: true },
  fileUrl: { type: String, required: true },
  fileSize: { type: Number },
  mimeType: { type: String },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  uploadedByModel: { type: String, enum: ['User', 'ClientUser'], default: 'User' },
  clientUserId: { type: Schema.Types.ObjectId, ref: 'ClientUser', index: true },
  source: { type: String, enum: ['staff', 'portal_client_upload', 'magic_link'], default: 'staff' },
  notes: { type: String, trim: true }
}, { timestamps: true });

documentSchema.plugin(tenantPlugin);

export const DocumentModel = mongoose.model<IDocument>('Document', documentSchema);
