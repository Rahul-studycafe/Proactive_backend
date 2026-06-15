import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface IClient extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  fileNo?: string;
  entityType?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  pan?: string;
  gstin?: string;
  photoUrl?: string;
  groupId?: mongoose.Types.ObjectId;
  tags: mongoose.Types.ObjectId[];
  assignedUsers: mongoose.Types.ObjectId[];
  customFieldValues: Map<string, any>;
  subscribedServices: {
    serviceId: mongoose.Types.ObjectId;
    customPrice?: number;
    customUsers: mongoose.Types.ObjectId[];
    subscribedAt: Date;
  }[];
  subscribedPackages: {
    packageId: mongoose.Types.ObjectId;
    customPrice?: number;
    subscribedAt: Date;
  }[];
  autoInvoice: boolean;
  allowNotifications: boolean;
  allowLogin: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const clientSchema = new Schema<IClient>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // Basic Identity
  name: { type: String, required: true, trim: true },
  fileNo: { type: String, trim: true },
  entityType: {
    type: String,
    enum: [
      'Sole Proprietorship', 'Private Limited', 'Individual',
      'One Person Company', 'Partnership Firm', 'LLP',
      'Trust', 'NGO', 'HUF', 'Public Limited', 'Other'
    ]
  },
  
  // Contact
  email: { type: String, trim: true },
  mobile: { type: String },
  phone: { type: String },
  address: { type: String },
  city: { type: String },
  state: { type: String },
  pincode: { type: String },
  
  // Tax Identifiers
  pan: { type: String, uppercase: true, trim: true },
  gstin: { type: String, uppercase: true, trim: true },
  
  // Metadata / Classification
  photoUrl: { type: String, default: '' },
  groupId: { type: Schema.Types.ObjectId, ref: 'ClientGroup' },
  tags: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
  assignedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  
  // Dynamic Custom Fields
  customFieldValues: { type: Map, of: Schema.Types.Mixed, default: {} },
  
  // Service Subscriptions
  subscribedServices: [{
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service' },
    customPrice: { type: Number },
    customUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    subscribedAt: { type: Date, default: Date.now }
  }],
  
  // Package Subscriptions
  subscribedPackages: [{
    packageId: { type: Schema.Types.ObjectId, ref: 'Package' },
    customPrice: { type: Number },
    subscribedAt: { type: Date, default: Date.now }
  }],
  
  // Automation Toggles
  autoInvoice: { type: Boolean, default: false },
  allowNotifications: { type: Boolean, default: true },
  allowLogin: { type: Boolean, default: false },
  
  // Status
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

clientSchema.index({ tenantId: 1, name: 1 });
clientSchema.index({ tenantId: 1, fileNo: 1 });
clientSchema.index({ tenantId: 1, entityType: 1 });
clientSchema.index({ tenantId: 1, 'tags': 1 });
clientSchema.index({ tenantId: 1, 'assignedUsers': 1 });
clientSchema.index({ tenantId: 1, gstin: 1 });
clientSchema.index({ tenantId: 1, pan: 1 });

clientSchema.plugin(tenantPlugin);

export const Client = mongoose.model<IClient>('Client', clientSchema);
