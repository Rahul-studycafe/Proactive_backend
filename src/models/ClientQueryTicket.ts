import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export type QueryTicketType =
  | 'Service Request'
  | 'Query'
  | 'Billing Inquiry'
  | 'Document Submission';

export type QueryTicketStatus = 'Open' | 'In Review' | 'Resolved' | 'Closed';

export interface IClientQueryTicket extends MongooseDocument {
  tenantId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  clientUserId: mongoose.Types.ObjectId;
  ticketNo: string;
  type: QueryTicketType;
  subject: string;
  message: string;
  attachments?: string[];
  status: QueryTicketStatus;
  assignedToUserId?: mongoose.Types.ObjectId;
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const clientQueryTicketSchema = new Schema<IClientQueryTicket>(
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
    clientUserId: {
      type: Schema.Types.ObjectId,
      ref: 'ClientUser',
      required: true
    },
    ticketNo: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: [
        'Service Request',
        'Query',
        'Billing Inquiry',
        'Document Submission'
      ],
      default: 'Query'
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    attachments: [{ type: String }],
    status: {
      type: String,
      enum: ['Open', 'In Review', 'Resolved', 'Closed'],
      default: 'Open',
      index: true
    },
    assignedToUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    resolutionNotes: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

clientQueryTicketSchema.index({ tenantId: 1, clientId: 1, status: 1 });
clientQueryTicketSchema.index({ tenantId: 1, ticketNo: 1 });

clientQueryTicketSchema.plugin(tenantPlugin);

export const ClientQueryTicket = mongoose.model<IClientQueryTicket>(
  'ClientQueryTicket',
  clientQueryTicketSchema
);

