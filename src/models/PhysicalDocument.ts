import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export const DOCUMENT_CATEGORIES = ['Received', 'Given'] as const;
export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];

export const PHYSICAL_DOCUMENT_TYPES = [
  'Passbook',
  'Cheque Book',
  'Original Deeds',
  'PAN Card',
  'Registration Certificate',
  'Company Seal',
  'Other'
] as const;
export type PhysicalDocumentType = typeof PHYSICAL_DOCUMENT_TYPES[number];

export const PHYSICAL_DOCUMENT_STATUSES = ['In Custody', 'Returned', 'Overdue'] as const;
export type PhysicalDocumentStatus = typeof PHYSICAL_DOCUMENT_STATUSES[number];

export interface IDocumentMovement {
  _id?: mongoose.Types.ObjectId;
  movementType: DocumentCategory;
  date: Date;
  location: string;
  custodianUserId: mongoose.Types.ObjectId;
  receivedByPersonName?: string;
  receivedByPhone?: string;
  returnedToPersonName?: string;
  isReturnable: boolean;
  returnDate?: Date;
  actualReturnedDate?: Date;
  notes?: string;
  createdAt?: Date;
}

export interface IPhysicalDocument extends MongooseDocument {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  date: Date;
  category: DocumentCategory;
  documentType: PhysicalDocumentType;
  documentName: string;
  isReturnable: boolean;
  returnDate?: Date;
  actualReturnedDate?: Date;
  status: PhysicalDocumentStatus;
  location: string;
  custodianUserId: mongoose.Types.ObjectId;
  receivedByPersonName?: string;
  receivedByPhone?: string;
  returnedToPersonName?: string;
  returnedNotes?: string;
  notes?: string;
  movements?: IDocumentMovement[];
  createdAt: Date;
  updatedAt: Date;
}

const physicalDocumentSchema = new Schema<IPhysicalDocument>(
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
    date: {
      type: Date,
      default: Date.now,
      required: true
    },
    category: {
      type: String,
      enum: DOCUMENT_CATEGORIES,
      required: true
    },
    documentType: {
      type: String,
      enum: PHYSICAL_DOCUMENT_TYPES,
      required: true
    },
    documentName: {
      type: String,
      required: true,
      trim: true
    },
    isReturnable: {
      type: Boolean,
      default: false
    },
    returnDate: {
      type: Date
    },
    actualReturnedDate: {
      type: Date
    },
    status: {
      type: String,
      enum: PHYSICAL_DOCUMENT_STATUSES,
      default: 'In Custody'
    },
    location: {
      type: String,
      required: true,
      trim: true
    },
    custodianUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    receivedByPersonName: {
      type: String,
      trim: true
    },
    receivedByPhone: {
      type: String,
      trim: true
    },
    returnedToPersonName: {
      type: String,
      trim: true
    },
    returnedNotes: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    },
    movements: [
      {
        movementType: {
          type: String,
          enum: DOCUMENT_CATEGORIES,
          required: true
        },
        date: {
          type: Date,
          default: Date.now,
          required: true
        },
        location: {
          type: String,
          required: true,
          trim: true
        },
        custodianUserId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        receivedByPersonName: {
          type: String,
          trim: true
        },
        receivedByPhone: {
          type: String,
          trim: true
        },
        returnedToPersonName: {
          type: String,
          trim: true
        },
        isReturnable: {
          type: Boolean,
          default: false
        },
        returnDate: {
          type: Date
        },
        actualReturnedDate: {
          type: Date
        },
        notes: {
          type: String,
          trim: true
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

// Compound indexes for fast multi-tenant queries
physicalDocumentSchema.index({ tenantId: 1, clientId: 1, date: -1 });
physicalDocumentSchema.index({ tenantId: 1, clientId: 1, documentName: 1 });
physicalDocumentSchema.index({ tenantId: 1, status: 1 });
physicalDocumentSchema.index({ tenantId: 1, returnDate: 1 });
physicalDocumentSchema.index({ tenantId: 1, location: 1 });
physicalDocumentSchema.index({ tenantId: 1, category: 1 });

physicalDocumentSchema.plugin(tenantPlugin);

export const PhysicalDocumentModel = mongoose.model<IPhysicalDocument>(
  'PhysicalDocument',
  physicalDocumentSchema
);
