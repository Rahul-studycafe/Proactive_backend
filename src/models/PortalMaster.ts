import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../common/plugins/tenant.plugin';

export const PORTAL_CATEGORIES = [
  'Taxation',
  'Corporate Affairs',
  'Labor Compliance',
  'Customs',
  'State Taxes',
  'Banking',
  'Other',
] as const;

export type PortalCategory = (typeof PORTAL_CATEGORIES)[number];

export interface IPortalMaster extends Document {
  tenantId?: mongoose.Types.ObjectId;
  name: string;
  portalUrl?: string;
  defaultUsernameFormat?: string;
  category: PortalCategory;
  isActive: boolean;
  isSystemDefault: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const portalMasterSchema = new Schema<IPortalMaster>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    portalUrl: {
      type: String,
      trim: true,
    },
    defaultUsernameFormat: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: PORTAL_CATEGORIES,
      default: 'Taxation',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isSystemDefault: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
portalMasterSchema.index({ tenantId: 1, name: 1 });
portalMasterSchema.index({ isSystemDefault: 1, isActive: 1 });

// System default seed records
export const DEFAULT_PORTAL_MASTERS = [
  {
    name: 'GST Portal',
    portalUrl: 'https://services.gst.gov.in/services/login',
    defaultUsernameFormat: 'GSTIN (15 characters) or Username',
    category: 'Taxation',
    isSystemDefault: true,
  },
  {
    name: 'Income Tax e-Filing Portal',
    portalUrl: 'https://eportal.incometax.gov.in/iec/foservices/#/login',
    defaultUsernameFormat: 'PAN (10 characters)',
    category: 'Taxation',
    isSystemDefault: true,
  },
  {
    name: 'MCA (Ministry of Corporate Affairs) / V3',
    portalUrl: 'https://www.mca.gov.in/mcafoportal/login.do',
    defaultUsernameFormat: 'Email / Username or DIN / PAN',
    category: 'Corporate Affairs',
    isSystemDefault: true,
  },
  {
    name: 'TRACES (TDS CPC)',
    portalUrl: 'https://www.tdscpc.gov.in/app/login.xhtml',
    defaultUsernameFormat: 'TAN or User ID',
    category: 'Taxation',
    isSystemDefault: true,
  },
  {
    name: 'EPFO Unified Portal',
    portalUrl: 'https://unifiedportal-emp.epfindia.gov.in/epfo/',
    defaultUsernameFormat: 'Establishment ID / User ID',
    category: 'Labor Compliance',
    isSystemDefault: true,
  },
  {
    name: 'ESIC Portal',
    portalUrl: 'https://www.esic.in/EmployerPortal/ESICInsurancePortal/Portal_Login.aspx',
    defaultUsernameFormat: 'Employer Code / 17 digits',
    category: 'Labor Compliance',
    isSystemDefault: true,
  },
  {
    name: 'ICEGATE (Indian Customs EDI Gateway)',
    portalUrl: 'https://www.icegate.gov.in/',
    defaultUsernameFormat: 'Customs ID / IEC No.',
    category: 'Customs',
    isSystemDefault: true,
  },
  {
    name: 'State Commercial Tax / VAT / PT',
    portalUrl: '',
    defaultUsernameFormat: 'State Registration No. / PT No.',
    category: 'State Taxes',
    isSystemDefault: true,
  },
];

export const PortalMaster = mongoose.model<IPortalMaster>('PortalMaster', portalMasterSchema);
