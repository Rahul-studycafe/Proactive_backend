import mongoose from 'mongoose';
import { TenantSettings } from '../modules/masters/schemas/tenant-settings.schema';

const DAY_NAME_TO_NUM: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6
};

export interface OfficePerimeterConfig {
  enableIpWhitelist: boolean;
  ipWhitelist: string[];
  enforceGeofence: boolean;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters: number;
}

export interface WorkingDaysConfig {
  weekends: string[];
  standardWorkHoursPerDay: number;
  alternateWeekendRules?: {
    day: string;
    weeks: number[];
  };
  officePerimeter?: OfficePerimeterConfig;
}

export interface UpdateWorkingDaysInput {
  weekends?: string[];
  standardWorkHoursPerDay?: number;
  alternateWeekendRules?: {
    day: string;
    weeks: number[];
  };
  officePerimeter?: Partial<OfficePerimeterConfig>;
}

export const getWorkingDaysService = async (
  tenantId: mongoose.Types.ObjectId
): Promise<WorkingDaysConfig> => {
  let settings = await TenantSettings.findOne({ tenantId });
  if (!settings) {
    settings = await TenantSettings.create({
      tenantId,
      workingDays: {
        weekends: ['Sunday'],
        standardWorkHoursPerDay: 8.5
      }
    });
  }

  const baseConfig = settings.workingDays || {
    weekends: ['Sunday'],
    standardWorkHoursPerDay: 8.5
  };

  const perimeter = settings.officePerimeter || {
    enableIpWhitelist: false,
    ipWhitelist: [],
    enforceGeofence: settings.officeLocation?.enforceGeofence || false,
    latitude: settings.officeLocation?.latitude,
    longitude: settings.officeLocation?.longitude,
    geofenceRadiusMeters: settings.officeLocation?.geofenceRadiusMeters || 150
  };

  return {
    ...baseConfig,
    officePerimeter: perimeter
  };
};

export const updateWorkingDaysService = async (
  tenantId: mongoose.Types.ObjectId,
  data: UpdateWorkingDaysInput
): Promise<WorkingDaysConfig> => {
  let settings = await TenantSettings.findOne({ tenantId });
  if (!settings) {
    settings = new TenantSettings({ tenantId });
  }

  if (!settings.workingDays) {
    settings.workingDays = {
      weekends: ['Sunday'],
      standardWorkHoursPerDay: 8.5
    };
  }

  if (data.weekends !== undefined) {
    settings.workingDays.weekends = data.weekends;
    // Keep attendance.weekendDays synchronized for legacy callers
    settings.attendance.weekendDays = data.weekends
      .map((day) => DAY_NAME_TO_NUM[day])
      .filter((num) => num !== undefined);
  }

  if (data.standardWorkHoursPerDay !== undefined) {
    settings.workingDays.standardWorkHoursPerDay = data.standardWorkHoursPerDay;
    settings.attendance.workingHoursPerDay = data.standardWorkHoursPerDay;
  }

  if (data.alternateWeekendRules !== undefined) {
    settings.workingDays.alternateWeekendRules = data.alternateWeekendRules;
  }

  if (data.officePerimeter !== undefined) {
    if (!settings.officePerimeter) {
      settings.officePerimeter = {
        enableIpWhitelist: false,
        ipWhitelist: [],
        enforceGeofence: false,
        latitude: undefined,
        longitude: undefined,
        geofenceRadiusMeters: 150
      };
    }

    if (data.officePerimeter.enableIpWhitelist !== undefined) {
      settings.officePerimeter.enableIpWhitelist = data.officePerimeter.enableIpWhitelist;
    }
    if (data.officePerimeter.ipWhitelist !== undefined) {
      settings.officePerimeter.ipWhitelist = data.officePerimeter.ipWhitelist.map((ip) => ip.trim()).filter(Boolean);
    }
    if (data.officePerimeter.enforceGeofence !== undefined) {
      settings.officePerimeter.enforceGeofence = data.officePerimeter.enforceGeofence;
    }
    if (data.officePerimeter.latitude !== undefined) {
      settings.officePerimeter.latitude = data.officePerimeter.latitude === null ? undefined : data.officePerimeter.latitude;
    }
    if (data.officePerimeter.longitude !== undefined) {
      settings.officePerimeter.longitude = data.officePerimeter.longitude === null ? undefined : data.officePerimeter.longitude;
    }
    if (data.officePerimeter.geofenceRadiusMeters !== undefined) {
      settings.officePerimeter.geofenceRadiusMeters = data.officePerimeter.geofenceRadiusMeters;
    }

    // Keep officeLocation synchronized for legacy callers
    settings.officeLocation = {
      latitude: settings.officePerimeter.latitude ?? 0,
      longitude: settings.officePerimeter.longitude ?? 0,
      geofenceRadiusMeters: settings.officePerimeter.geofenceRadiusMeters,
      enforceGeofence: settings.officePerimeter.enforceGeofence
    };
  }

  await settings.save();
  return getWorkingDaysService(tenantId);
};
