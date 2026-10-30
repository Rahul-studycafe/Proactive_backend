import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface IClient extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  fileNo?: string;
  entityType?: string;
  email?: string;
  mobile?: string;
  secondaryMobile?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  pan?: string;
  gstin?: string;
  photoUrl?: string;
  groupId?: mongoose.Types.ObjectId;
  tags: string[];
  billingProfileId?: mongoose.Types.ObjectId;
  contactPersonName?: string;
  dateOfBirth?: Date;
  openingBalance?: number;
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
  panVerified?: boolean;
  gstinVerified?: boolean;
  verifiedAt?: Date;
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
  secondaryMobile: { type: String },
  address: { type: String },
  city: { type: String },
  state: { type: String },
  pincode: { type: String },
  
  // Tax Identifiers
  pan: { type: String, uppercase: true, trim: true },
  gstin: { type: String, uppercase: true, trim: true },
  panVerified: { type: Boolean, default: false },
  gstinVerified: { type: Boolean, default: false },
  verifiedAt: { type: Date },
  
  // Metadata / Classification
  photoUrl: { type: String, default: '' },
  groupId: { type: Schema.Types.ObjectId, ref: 'ClientGroup' },
  tags: [{ type: String }],
  assignedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  
  // Billing & Contact Person
  billingProfileId: { type: Schema.Types.ObjectId, ref: 'Client' },
  contactPersonName: { type: String, trim: true },
  dateOfBirth: { type: Date },
  openingBalance: { type: Number, default: 0 },
  
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
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for bound Tasks
clientSchema.virtual('tasks', {
  ref: 'Task',
  localField: '_id',
  foreignField: 'clientId'
});

// Virtual for bound Client Portal Users
clientSchema.virtual('portalUsers', {
  ref: 'ClientUser',
  localField: '_id',
  foreignField: 'clientId'
});

clientSchema.index({ tenantId: 1, name: 1 });
clientSchema.index({ tenantId: 1, fileNo: 1 });
clientSchema.index({ tenantId: 1, entityType: 1 });
clientSchema.index({ tenantId: 1, 'tags': 1 });
clientSchema.index({ tenantId: 1, 'assignedUsers': 1 });
clientSchema.index({ tenantId: 1, gstin: 1 });
clientSchema.index({ tenantId: 1, pan: 1 });

clientSchema.plugin(tenantPlugin);

export const Client = mongoose.model<IClient>('Client', clientSchema);
