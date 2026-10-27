import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export const REQUESTED_ITEM_STATUSES = ['Pending', 'Uploaded', 'Rejected'] as const;
export type RequestedItemStatus = typeof REQUESTED_ITEM_STATUSES[number];

export const DOCUMENT_REQUEST_STATUSES = [
  'Pending',
  'Partially Uploaded',
  'Completed',
  'Expired',
  'Cancelled'
] as const;
export type DocumentRequestStatus = typeof DOCUMENT_REQUEST_STATUSES[number];

export interface IRequestedFileItem {
  _id?: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isRequired: boolean;
  acceptedFormats: string[];
  uploadedDocumentId?: mongoose.Types.ObjectId;
  uploadedAt?: Date;
  status: RequestedItemStatus;
}

export interface IDocumentRequest extends MongooseDocument {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  taskId?: mongoose.Types.ObjectId;
  requestNo: string;
  title: string;
  instructions?: string;
  token: string;
  items: IRequestedFileItem[];
  expiresAt: Date;
  status: DocumentRequestStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const requestedFileItemSchema = new Schema<IRequestedFileItem>(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    isRequired: {
      type: Boolean,
      default: true
    },
    acceptedFormats: {
      type: [String],
      default: ['.pdf', '.xlsx', '.csv', '.zip', '.png', '.jpg']
    },
    uploadedDocumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document'
    },
    uploadedAt: {
      type: Date
    },
    status: {
      type: String,
      enum: REQUESTED_ITEM_STATUSES,
      default: 'Pending'
    }
  },
  { _id: true }
);

const documentRequestSchema = new Schema<IDocumentRequest>(
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
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      index: true
    },
    requestNo: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    instructions: {
      type: String,
      trim: true
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    items: {
      type: [requestedFileItemSchema],
      default: []
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: DOCUMENT_REQUEST_STATUSES,
      default: 'Pending',
      index: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

documentRequestSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });
documentRequestSchema.index({ tenantId: 1, status: 1 });
documentRequestSchema.index({ expiresAt: 1, status: 1 });

documentRequestSchema.plugin(tenantPlugin);

export const DocumentRequest = mongoose.model<IDocumentRequest>(
  'DocumentRequest',
  documentRequestSchema
);
