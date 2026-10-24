import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from '../../../common/plugins/tenant.plugin';

export interface IClientCustomField {
  label: string;
  fieldType: 'text' | 'number' | 'select' | 'date' | 'email' | 'phone';
  options?: string[]; // Only for 'select' type
  isRequired: boolean;
  orderIndex: number;
}

export interface ITenantSettings extends Document {
  tenantId: mongoose.Types.ObjectId;
  
  clientCustomFields: IClientCustomField[];
  
  attendance: {
    weekendDays: number[];
    workingHoursPerDay: number;
    overtimeThreshold: number;
  };
  
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    whatsappEnabled: boolean;
  };
  
  allowDuplicateClientNames: boolean;
  defaultGstPercentage: number;
  financialYearStart: number;
  
  workingDays?: {
    weekends: string[];
    standardWorkHoursPerDay: number;
    alternateWeekendRules?: {
      day: string;
      weeks: number[];
    };
  };

  officeLocation?: {
    latitude: number;
    longitude: number;
    geofenceRadiusMeters?: number;
    enforceGeofence?: boolean;
  };

  officePerimeter?: {
    enableIpWhitelist: boolean;
    ipWhitelist: string[];
    enforceGeofence: boolean;
    latitude?: number;
    longitude?: number;
    geofenceRadiusMeters: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

const tenantSettingsSchema = new Schema<ITenantSettings>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
  
  // Client Custom Field Definitions
  clientCustomFields: [{
    label: { type: String, required: true },
    fieldType: { type: String, enum: ['text', 'number', 'select', 'date', 'email', 'phone'], required: true },
    options: [{ type: String }],
    isRequired: { type: Boolean, default: false },
    orderIndex: { type: Number, default: 0 }
  }],
  
  // Attendance Config
  attendance: {
    weekendDays: { type: [Number], default: [0] }, // 0=Sunday
    workingHoursPerDay: { type: Number, default: 8 },
    overtimeThreshold: { type: Number, default: 480 } // minutes
  },

  // Phase 51: Operational Work Days & Weekends
  workingDays: {
    weekends: {
      type: [String],
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      default: ['Sunday']
    },
    standardWorkHoursPerDay: {
      type: Number,
      default: 8.5
    },
    alternateWeekendRules: {
      day: { type: String, default: 'Saturday' },
      weeks: { type: [Number], default: [] }
    }
  },

  // Office Location & Geofencing (Legacy)
  officeLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
    geofenceRadiusMeters: { type: Number, default: 150 },
    enforceGeofence: { type: Boolean, default: false }
  },

  // Dual-Mode Office Perimeter (IP Whitelist & GPS Geofence)
  officePerimeter: {
    enableIpWhitelist: { type: Boolean, default: false },
    ipWhitelist: { type: [String], default: [] },
    enforceGeofence: { type: Boolean, default: false },
    latitude: { type: Number },
    longitude: { type: Number },
    geofenceRadiusMeters: { type: Number, default: 150 }
  },
  
  // Notification Config
  notifications: {
    emailEnabled: { type: Boolean, default: false },
    smsEnabled: { type: Boolean, default: false },
    whatsappEnabled: { type: Boolean, default: false }
  },
  
  // Misc
  allowDuplicateClientNames: { type: Boolean, default: false },
  defaultGstPercentage: { type: Number, default: 18 },
  financialYearStart: { type: Number, default: 4 } // April
}, { timestamps: true });

tenantSettingsSchema.plugin(tenantPlugin);

export const TenantSettings =
  (mongoose.models.TenantSettings as mongoose.Model<ITenantSettings>) ||
  mongoose.model<ITenantSettings>('TenantSettings', tenantSettingsSchema);
