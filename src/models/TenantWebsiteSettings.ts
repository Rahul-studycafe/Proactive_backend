import mongoose, { Schema, Document } from 'mongoose';

export interface ITenantWebsiteSettings extends Document {
  tenantId: mongoose.Types.ObjectId;
  subdomain: string;
  customDomain?: string;
  branding: {
    firmName: string;
    logoUrl?: string;
    faviconUrl?: string;
    brandColor?: string;
  };
  hero: {
    title: string;
    subtitle: string;
    bannerImageUrl?: string;
  };
  contact: {
    email: string;
    phone: string;
    address: string;
  };
  services: Array<{
    title: string;
    description: string;
    isActive: boolean;
  }>;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TenantWebsiteSettingsSchema = new Schema<ITenantWebsiteSettings>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
    subdomain: { type: String, lowercase: true, trim: true, index: true },
    customDomain: { type: String, lowercase: true, trim: true, index: true },
    branding: {
      firmName: { type: String, default: 'Proactive Advisory' },
      logoUrl: { type: String, default: '' },
      faviconUrl: { type: String, default: '' },
      brandColor: { type: String, default: '#2563eb' }
    },
    hero: {
      title: { type: String, default: 'Client Self-Service Portal' },
      subtitle: { type: String, default: 'Track statutory filings, view acknowledged returns, and access invoices securely.' },
      bannerImageUrl: { type: String, default: '' }
    },
    contact: {
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      address: { type: String, default: '' }
    },
    services: [
      {
        title: { type: String, required: true },
        description: { type: String, default: '' },
        isActive: { type: Boolean, default: true }
      }
    ],
    isPublished: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const TenantWebsiteSettings = mongoose.model<ITenantWebsiteSettings>(
  'TenantWebsiteSettings',
  TenantWebsiteSettingsSchema
);

