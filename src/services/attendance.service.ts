import mongoose from 'mongoose';
import { Attendance, IAttendance, AttendanceStatus } from '../models/Attendance';
import { Holiday } from '../models/Holiday';
import { User } from '../modules/auth/schemas';
import { TenantSettings } from '../modules/masters/schemas/tenant-settings.schema';
import { ApiError } from '../common/errors/api-error';
import { getWorkingDaysService } from './tenant-settings.service';
import { isIpInWhitelist } from '../utils/ip-matcher';

export interface CheckInInput {
  date?: string;
  timestamp?: string | Date;
  notes?: string;
  latitude?: number;
  longitude?: number;
  clientIp?: string;
}

export interface CheckOutInput {
  date?: string;
  timestamp?: string | Date;
  notes?: string;
  latitude?: number;
  longitude?: number;
  clientIp?: string;
}

/**
 * Computes great-circle distance between two GPS coordinates in meters using Haversine formula
 */
export function calculateDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Validates office perimeter (Dual-mode: Wi-Fi IP Whitelist vs. GPS Geofence).
 * Throws ApiError if perimeter rules are active and request is outside.
 */
export const validatePerimeter = async (
  tenantId: mongoose.Types.ObjectId,
  data: { clientIp?: string; latitude?: number; longitude?: number },
  actionName: 'check-in' | 'check-out' = 'check-in'
): Promise<'office_ip' | 'gps' | 'manual' | 'unrestricted'> => {
  const settings = await TenantSettings.findOne({ tenantId });
  const perimeter = settings?.officePerimeter;
  const legacyLoc = settings?.officeLocation;

  const isIpWhitelistConfigured =
    Boolean(perimeter?.enableIpWhitelist &&
    Array.isArray(perimeter?.ipWhitelist) &&
    perimeter.ipWhitelist.length > 0);
  const isGeofenceConfigured =
    Boolean(perimeter?.enforceGeofence ?? legacyLoc?.enforceGeofence ?? false);
  const officeLat = perimeter?.latitude ?? legacyLoc?.latitude;
  const officeLng = perimeter?.longitude ?? legacyLoc?.longitude;
  const geofenceRadius = perimeter?.geofenceRadiusMeters ?? legacyLoc?.geofenceRadiusMeters ?? 150;

  if (isIpWhitelistConfigured && isGeofenceConfigured) {
    if (data.clientIp && isIpInWhitelist(data.clientIp, perimeter!.ipWhitelist)) {
      return 'office_ip';
    } else {
      if (data.latitude === undefined || data.longitude === undefined) {
        throw new ApiError(
          400,
          `Not on office Wi-Fi / IP (${data.clientIp || 'unknown'}). GPS coordinates are required for geofence ${actionName}.`,
          'OUTSIDE_OFFICE_PERIMETER'
        );
      }
      if (officeLat !== undefined && officeLng !== undefined) {
        const distance = calculateDistanceInMeters(officeLat, officeLng, data.latitude, data.longitude);
        if (distance > geofenceRadius) {
          throw new ApiError(
            400,
            `Outside office perimeter: Network IP (${data.clientIp || 'unknown'}) is not on the office whitelist and GPS location is ${Math.round(distance)}m away (max ${geofenceRadius}m allowed). Cannot ${actionName}.`,
            'OUTSIDE_OFFICE_PERIMETER'
          );
        }
      }
      return 'gps';
    }
  } else if (isIpWhitelistConfigured) {
    if (!data.clientIp || !isIpInWhitelist(data.clientIp, perimeter!.ipWhitelist)) {
      throw new ApiError(
        400,
        `Your network IP (${data.clientIp || 'unknown'}) is not on the authorized office Wi-Fi / IP whitelist. Cannot ${actionName}.`,
        'OUTSIDE_OFFICE_IP'
      );
    }
    return 'office_ip';
  } else if (isGeofenceConfigured) {
    if (data.latitude === undefined || data.longitude === undefined) {
      throw new ApiError(
        400,
        `GPS coordinates (latitude, longitude) are required for ${actionName}`,
        'GEOFENCE_COORDINATES_REQUIRED'
      );
    }
    if (officeLat !== undefined && officeLng !== undefined) {
      const distance = calculateDistanceInMeters(officeLat, officeLng, data.latitude, data.longitude);
      if (distance > geofenceRadius) {
        throw new ApiError(
          400,
          `You are outside the authorized office location (${Math.round(distance)}m away, allowable: ${geofenceRadius}m). Cannot ${actionName}.`,
          'OUTSIDE_GEOFENCE'
        );
      }
    }
    return 'gps';
  }

  return 'unrestricted';
};

export const checkInService = async (
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  data: CheckInInput = {}
): Promise<IAttendance> => {
  const checkInTime = data.timestamp ? new Date(data.timestamp) : new Date();
  if (isNaN(checkInTime.getTime())) {
    throw new ApiError(400, 'Invalid check-in timestamp', 'INVALID_TIMESTAMP');
  }

  // Strict day-shift rule: check-in is strictly for current date
  const todayStr = new Date().toISOString().split('T')[0];
  const dateStr = data.date || todayStr;

  // Dual-mode perimeter validation: IP Whitelist vs. GPS Geofence
  const verifiedVia = await validatePerimeter(tenantId, data, 'check-in');

  let entry = await Attendance.findOne({ tenantId, userId, date: dateStr });
  if (entry && entry.checkIn) {
    throw new ApiError(
      400,
      'Staff member has already checked in today',
      'ALREADY_CHECKED_IN'
    );
  }

  if (entry) {
    entry.checkIn = checkInTime;
    entry.status = 'Present';
    entry.markedBy = userId;
    entry.verifiedVia = verifiedVia;
    entry.ipAddress = data.clientIp;
    if (data.notes) entry.notes = data.notes.trim();
    await entry.save();
    return entry;
  }

  entry = await Attendance.create({
    tenantId,
    userId,
    date: dateStr,
    status: 'Present',
    checkIn: checkInTime,
    markedBy: userId,
    verifiedVia,
    ipAddress: data.clientIp,
    notes: data.notes?.trim()
  });

  return entry;
};

export const checkOutService = async (
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  data: CheckOutInput = {}
): Promise<IAttendance> => {
  const checkOutTime = data.timestamp ? new Date(data.timestamp) : new Date();
  if (isNaN(checkOutTime.getTime())) {
    throw new ApiError(400, 'Invalid check-out timestamp', 'INVALID_TIMESTAMP');
  }

  const dateStr = data.date || checkOutTime.toISOString().split('T')[0];

  const entry = await Attendance.findOne({ tenantId, userId, date: dateStr });
  if (!entry || !entry.checkIn) {
    throw new ApiError(
      400,
      'No active check-in found for today',
      'NOT_CHECKED_IN'
    );
  }

  if (entry.checkOut) {
    throw new ApiError(
      400,
      'Staff member has already checked out today',
      'ALREADY_CHECKED_OUT'
    );
  }

  if (checkOutTime.getTime() < entry.checkIn.getTime()) {
    throw new ApiError(
      400,
      'Check-out time cannot be before check-in time',
      'INVALID_CHECK_OUT_TIME'
    );
  }

  // Enforce Office Perimeter (Wi-Fi IP Whitelist & GPS Geofence) for check-out
  await validatePerimeter(tenantId, data, 'check-out');

  const totalMinutes = Math.round(
    (checkOutTime.getTime() - entry.checkIn.getTime()) / 60000
  );

  const workDaysConfig = await getWorkingDaysService(tenantId);
  const standardHours = workDaysConfig.standardWorkHoursPerDay ?? 8.5;
  const standardMinutes = Math.round(standardHours * 60);

  // < 4 hours (240 mins) is counted as Half Day; >= 4 hours is Present
  const status = totalMinutes < 240 ? 'Half Day' : 'Present';
  const overtimeMinutes =
    totalMinutes > standardMinutes ? totalMinutes - standardMinutes : 0;

  entry.checkOut = checkOutTime;
  entry.totalMinutes = totalMinutes;
  entry.overtimeMinutes = overtimeMinutes;
  entry.status = status;

  if (data.notes) {
    entry.notes = entry.notes
      ? `${entry.notes}; ${data.notes.trim()}`
      : data.notes.trim();
  }

  await entry.save();
  return entry;
};

export const getTodayAttendanceService = async (
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  dateStr?: string
): Promise<IAttendance | null> => {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];
  const entry = await Attendance.findOne({
    tenantId,
    userId,
    date: targetDate
  });
  return entry;
};

export interface DailyRosterSummary {
  totalStaff: number;
  present: number;
  halfDay: number;
  leave: number;
  absent: number;
  holiday: number;
  unmarked: number;
}

export interface DailyRosterMember {
  _id: mongoose.Types.ObjectId;
  name: string;
  username: string;
  email?: string;
  roleId?: mongoose.Types.ObjectId;
  roleName?: string;
  attendance: IAttendance | null;
}

export interface DailyRosterResult {
  date: string;
  summary: DailyRosterSummary;
  roster: DailyRosterMember[];
}

export const getDailyRosterService = async (
  tenantId: mongoose.Types.ObjectId,
  dateStr?: string
): Promise<DailyRosterResult> => {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];

  const rawRoster = await User.aggregate([
    {
      $match: {
        tenantId,
        isActive: true
      }
    },
    {
      $lookup: {
        from: 'attendances',
        let: { userId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$userId', '$$userId'] },
                  { $eq: ['$date', targetDate] },
                  { $eq: ['$tenantId', tenantId] }
                ]
              }
            }
          }
        ],
        as: 'attendance'
      }
    },
    {
      $lookup: {
        from: 'roles',
        localField: 'roleId',
        foreignField: '_id',
        as: 'role'
      }
    },
    {
      $project: {
        _id: 1,
        name: 1,
        username: 1,
        email: 1,
        roleId: 1,
        roleName: { $arrayElemAt: ['$role.name', 0] },
        attendance: { $arrayElemAt: ['$attendance', 0] }
      }
    },
    { $sort: { name: 1 } }
  ]);

  const summary: DailyRosterSummary = {
    totalStaff: rawRoster.length,
    present: 0,
    halfDay: 0,
    leave: 0,
    absent: 0,
    holiday: 0,
    unmarked: 0
  };

  const roster: DailyRosterMember[] = rawRoster.map((member) => {
    const att = member.attendance || null;
    if (!att || !att.status) {
      summary.unmarked++;
    } else {
      switch (att.status) {
        case 'Present':
          summary.present++;
          break;
        case 'Half Day':
          summary.halfDay++;
          break;
        case 'Leave':
        case 'Paid Leave':
          summary.leave++;
          break;
        case 'Absent':
          summary.absent++;
          break;
        case 'Holiday':
          summary.holiday++;
          break;
        default:
          summary.unmarked++;
          break;
      }
    }

    return {
      _id: member._id,
      name: member.name,
      username: member.username,
      email: member.email,
      roleId: member.roleId,
      roleName: member.roleName,
      attendance: att
    };
  });

  return {
    date: targetDate,
    summary,
    roster
  };
};

export interface MarkAttendanceInput {
  userId: string | mongoose.Types.ObjectId;
  date: string;
  status: AttendanceStatus;
  checkIn?: string | Date | null;
  checkOut?: string | Date | null;
  notes?: string | null;
}

export const markAttendanceService = async (
  tenantId: mongoose.Types.ObjectId,
  markedByUserId: mongoose.Types.ObjectId,
  data: MarkAttendanceInput
): Promise<IAttendance> => {
  const targetUserId = new mongoose.Types.ObjectId(data.userId);

  // Verify target user belongs to tenant
  const targetUser = await User.findOne({ _id: targetUserId, tenantId });
  if (!targetUser) {
    throw new ApiError(404, 'Employee not found in this organization', 'USER_NOT_FOUND');
  }

  let checkInDate: Date | undefined;
  if (data.checkIn) {
    checkInDate = new Date(data.checkIn);
    if (isNaN(checkInDate.getTime())) {
      throw new ApiError(400, 'Invalid check-in timestamp', 'INVALID_TIMESTAMP');
    }
  }

  let checkOutDate: Date | undefined;
  if (data.checkOut) {
    checkOutDate = new Date(data.checkOut);
    if (isNaN(checkOutDate.getTime())) {
      throw new ApiError(400, 'Invalid check-out timestamp', 'INVALID_TIMESTAMP');
    }
  }

  let entry = await Attendance.findOne({
    tenantId,
    userId: targetUserId,
    date: data.date
  });

  const isNonWorkingStatus = ['Leave', 'Paid Leave', 'Absent', 'Holiday'].includes(data.status);

  let effectiveCheckIn: Date | undefined;
  let effectiveCheckOut: Date | undefined;

  if (isNonWorkingStatus && !data.checkIn && !data.checkOut) {
    effectiveCheckIn = undefined;
    effectiveCheckOut = undefined;
  } else {
    effectiveCheckIn = data.checkIn !== undefined ? checkInDate : entry?.checkIn;
    effectiveCheckOut = data.checkOut !== undefined ? checkOutDate : entry?.checkOut;
  }

  let totalMinutes = 0;
  let overtimeMinutes = 0;

  if (effectiveCheckIn && effectiveCheckOut) {
    if (effectiveCheckOut.getTime() < effectiveCheckIn.getTime()) {
      throw new ApiError(
        400,
        'Check-out time cannot be before check-in time',
        'INVALID_CHECK_OUT_TIME'
      );
    }
    totalMinutes = Math.round(
      (effectiveCheckOut.getTime() - effectiveCheckIn.getTime()) / 60000
    );
    const workDaysConfig = await getWorkingDaysService(tenantId);
    const standardHours = workDaysConfig.standardWorkHoursPerDay ?? 8.5;
    const standardMinutes = Math.round(standardHours * 60);
    overtimeMinutes =
      totalMinutes > standardMinutes ? totalMinutes - standardMinutes : 0;
  }

  if (entry) {
    entry.status = data.status;
    entry.checkIn = effectiveCheckIn;
    entry.checkOut = effectiveCheckOut;
    entry.totalMinutes = totalMinutes;
    entry.overtimeMinutes = overtimeMinutes;
    entry.markedBy = markedByUserId;
    if (data.notes !== undefined) {
      entry.notes = data.notes ? data.notes.trim() : undefined;
    }
    await entry.save();
    return entry;
  }

  entry = await Attendance.create({
    tenantId,
    userId: targetUserId,
    date: data.date,
    status: data.status,
    checkIn: effectiveCheckIn,
    checkOut: effectiveCheckOut,
    totalMinutes,
    overtimeMinutes,
    markedBy: markedByUserId,
    notes: data.notes ? data.notes.trim() : undefined
  });

  return entry;
};

export interface BulkMarkAttendanceInput {
  userIds: string[];
  date: string;
  status: AttendanceStatus;
  notes?: string | null;
}

export interface BulkMarkAttendanceResult {
  date: string;
  status: AttendanceStatus;
  affectedCount: number;
  upsertedCount: number;
  modifiedCount: number;
  matchedCount: number;
}

export const bulkMarkAttendanceService = async (
  tenantId: mongoose.Types.ObjectId,
  markedByUserId: mongoose.Types.ObjectId,
  data: BulkMarkAttendanceInput
): Promise<BulkMarkAttendanceResult> => {
  const uniqueUserIds = [...new Set(data.userIds)];
  if (uniqueUserIds.length === 0) {
    throw new ApiError(400, 'At least one employee must be selected', 'EMPTY_USER_LIST');
  }
  if (uniqueUserIds.length > 250) {
    throw new ApiError(400, 'Batch size cannot exceed 250 employees', 'BATCH_SIZE_EXCEEDED');
  }

  const targetObjectIds = uniqueUserIds.map((id) => new mongoose.Types.ObjectId(id));

  // Verify that all selected users belong to the current tenant
  const validUsers = await User.find({
    _id: { $in: targetObjectIds },
    tenantId
  }).select('_id');

  if (validUsers.length !== targetObjectIds.length) {
    throw new ApiError(
      400,
      'One or more employees do not belong to this organization',
      'INVALID_EMPLOYEE_SELECTION'
    );
  }

  const isNonWorkingStatus = ['Leave', 'Paid Leave', 'Absent', 'Holiday'].includes(data.status);

  const operations = targetObjectIds.map((uid) => {
    const updateFields: any = {
      status: data.status,
      markedBy: markedByUserId
    };

    if (data.notes !== undefined) {
      updateFields.notes = data.notes ? data.notes.trim() : undefined;
    }

    if (isNonWorkingStatus) {
      updateFields.checkIn = null;
      updateFields.checkOut = null;
      updateFields.totalMinutes = 0;
      updateFields.overtimeMinutes = 0;
    }

    return {
      updateOne: {
        filter: {
          tenantId,
          userId: uid,
          date: data.date
        },
        update: {
          $set: updateFields,
          $setOnInsert: {
            tenantId,
            userId: uid,
            date: data.date
          }
        },
        upsert: true
      }
    };
  });

  const result = await Attendance.bulkWrite(operations);

  const upsertedCount = result.upsertedCount || 0;
  const modifiedCount = result.modifiedCount || 0;
  const matchedCount = result.matchedCount || 0;

  return {
    date: data.date,
    status: data.status,
    affectedCount: upsertedCount + modifiedCount,
    upsertedCount,
    modifiedCount,
    matchedCount
  };
};

export interface MonthlyMatrixDay {
  day: number;
  date: string;
  dayOfWeek: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holiday: { name: string; type: string } | null;
}

export interface MonthlyMatrixHoliday {
  _id: mongoose.Types.ObjectId;
  name: string;
  date: string;
  type: string;
  description?: string;
}

export interface MonthlyMatrixStaffMember {
  _id: mongoose.Types.ObjectId;
  name: string;
  username: string;
  email?: string;
  roleId?: mongoose.Types.ObjectId;
  roleName?: string;
  joiningDate?: string;
  records: Record<string | number, any>;
}

export interface MonthlyMatrixResult {
  month: string;
  year: string;
  daysInMonth: number;
  weekends: string[];
  holidays: MonthlyMatrixHoliday[];
  days: MonthlyMatrixDay[];
  staff: MonthlyMatrixStaffMember[];
  matrix: Record<string, Record<string | number, any>>;
}

export const getMonthlyMatrixService = async (
  tenantId: mongoose.Types.ObjectId,
  monthParam?: string,
  yearParam?: string,
  departmentId?: string,
  page?: number,
  limit?: number,
  targetUserId?: string | mongoose.Types.ObjectId
): Promise<MonthlyMatrixResult> => {
  const now = new Date();
  const month = monthParam
    ? monthParam.padStart(2, '0')
    : String(now.getUTCMonth() + 1).padStart(2, '0');
  const year = yearParam ? String(yearParam) : String(now.getUTCFullYear());

  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);

  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    throw new ApiError(400, 'Month must be between 1 and 12', 'INVALID_MONTH');
  }

  if (isNaN(yearNum) || yearNum < 1970 || yearNum > 2100) {
    throw new ApiError(400, 'Invalid year provided', 'INVALID_YEAR');
  }

  const daysInMonth = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
  const monthPrefix = `${year}-${month}`;
  const startDate = `${monthPrefix}-01`;
  const endDate = `${monthPrefix}-${String(daysInMonth).padStart(2, '0')}`;

  // 1. Fetch Working Days Configuration
  const workDaysConfig = await getWorkingDaysService(tenantId);
  const weekends = workDaysConfig.weekends || ['Sunday'];
  const alternateRules = workDaysConfig.alternateWeekendRules;

  const isAlternateWeekend = (dayName: string, dayNumber: number): boolean => {
    if (!alternateRules || !alternateRules.weeks || alternateRules.weeks.length === 0) return false;
    if (dayName !== alternateRules.day) return false;
    const weekNum = Math.ceil(dayNumber / 7);
    return alternateRules.weeks.includes(weekNum);
  };

  // 2. Fetch Holidays for this month
  const holidays = await Holiday.find({
    tenantId,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 });

  const holidaysMap: Record<string, { name: string; type: string }> = {};
  holidays.forEach((h) => {
    holidaysMap[h.date] = { name: h.name, type: h.type };
  });

  // 3. Build Calendar Days metadata
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const days: MonthlyMatrixDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dayPadded = String(d).padStart(2, '0');
    const dateStr = `${monthPrefix}-${dayPadded}`;
    const dateObj = new Date(`${dateStr}T00:00:00Z`);
    const dayOfWeek = dayNames[dateObj.getUTCDay()];
    const isWeekend = weekends.includes(dayOfWeek) || isAlternateWeekend(dayOfWeek, d);
    const holidayInfo = holidaysMap[dateStr] || null;

    days.push({
      day: d,
      date: dateStr,
      dayOfWeek,
      isWeekend,
      isHoliday: !!holidayInfo,
      holiday: holidayInfo ? { name: holidayInfo.name, type: holidayInfo.type } : null
    });
  }

  // 4. Fetch Active Staff members with optional department and pagination filtering
  const staffMatch: any = { tenantId, isActive: true };
  if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
    staffMatch.departmentId = new mongoose.Types.ObjectId(departmentId);
  }
  if (targetUserId) {
    staffMatch._id = new mongoose.Types.ObjectId(targetUserId);
  }

  const staffPipeline: any[] = [
    { $match: staffMatch },
    {
      $lookup: {
        from: 'roles',
        localField: 'roleId',
        foreignField: '_id',
        as: 'role'
      }
    },
    {
      $project: {
        _id: 1,
        name: 1,
        username: 1,
        email: 1,
        roleId: 1,
        joiningDate: 1,
        roleName: { $arrayElemAt: ['$role.name', 0] }
      }
    },
    { $sort: { name: 1 } }
  ];

  if (page && limit && page > 0 && limit > 0) {
    staffPipeline.push({ $skip: (page - 1) * limit });
    staffPipeline.push({ $limit: limit });
  }

  const rawStaff = await User.aggregate(staffPipeline);

  // 5. Fetch Attendance documents for the month
  const attendanceRecords = await Attendance.find({
    tenantId,
    date: { $gte: startDate, $lte: endDate }
  });

  // 6. Build matrix
  const matrix: Record<string, Record<string | number, any>> = {};

  rawStaff.forEach((s) => {
    matrix[s._id.toString()] = {};
  });

  // Pre-fill pre-joining days for mid-month joinees or future joinees
  rawStaff.forEach((s) => {
    const uId = s._id.toString();
    const joinDateVal = s.joiningDate;
    if (joinDateVal) {
      const joinDateStr =
        joinDateVal instanceof Date
          ? joinDateVal.toISOString().split('T')[0]
          : String(joinDateVal).split('T')[0];

      if (joinDateStr > startDate) {
        for (let d = 1; d <= daysInMonth; d++) {
          const dayPadded = String(d).padStart(2, '0');
          const dateStr = `${monthPrefix}-${dayPadded}`;
          if (dateStr < joinDateStr) {
            const preJoiningEntry = {
              _id: null,
              date: dateStr,
              status: 'N/A',
              isPreJoining: true,
              checkIn: null,
              checkOut: null,
              totalMinutes: 0,
              overtimeMinutes: 0,
              notes: `Joined on ${joinDateStr}`
            };
            matrix[uId][d] = preJoiningEntry;
            matrix[uId][dateStr] = preJoiningEntry;
          }
        }
      }
    }
  });

  attendanceRecords.forEach((rec) => {
    const uId = rec.userId.toString();
    if (matrix[uId]) {
      const dayNum = parseInt(rec.date.split('-')[2], 10);
      const entryData = {
        _id: rec._id,
        date: rec.date,
        status: rec.status,
        checkIn: rec.checkIn || null,
        checkOut: rec.checkOut || null,
        totalMinutes: rec.totalMinutes || 0,
        overtimeMinutes: rec.overtimeMinutes || 0,
        verifiedVia: rec.verifiedVia,
        ipAddress: rec.ipAddress,
        notes: rec.notes || null
      };
      matrix[uId][dayNum] = entryData;
      matrix[uId][rec.date] = entryData;
    }
  });

  const staff: MonthlyMatrixStaffMember[] = rawStaff.map((s) => ({
    _id: s._id,
    name: s.name,
    username: s.username,
    email: s.email,
    roleId: s.roleId,
    roleName: s.roleName,
    joiningDate: s.joiningDate
      ? (s.joiningDate instanceof Date
          ? s.joiningDate.toISOString().split('T')[0]
          : String(s.joiningDate).split('T')[0])
      : undefined,
    records: matrix[s._id.toString()] || {}
  }));

  return {
    month,
    year,
    daysInMonth,
    weekends,
    holidays: holidays.map((h) => ({
      _id: h._id as mongoose.Types.ObjectId,
      name: h.name,
      date: h.date,
      type: h.type,
      description: h.description
    })),
    days,
    staff,
    matrix
  };
};

export interface StaffAttendanceSummaryResult {
  userId: mongoose.Types.ObjectId;
  userName: string;
  month: string;
  year: string;
  totalDays: number;
  effectiveTotalDays: number;
  isProrated: boolean;
  preJoiningDays: number;
  joiningDate: string | null;
  presentDays: number;
  halfDays: number;
  paidLeaves: number;
  unpaidLeaves: number;
  absentDays: number;
  holidays: number;
  weekendsCount: number;
  officialHolidaysCount: number;
  payableDays: number;
  attendancePercentage: number;
  totalWorkingMinutes: number;
  totalOvertimeMinutes: number;
  records?: Array<{
    date: string;
    status: string;
    checkIn?: Date;
    checkOut?: Date;
    totalMinutes?: number;
    overtimeMinutes?: number;
    notes?: string;
  }>;
}

export const getStaffAttendanceSummaryService = async (
  tenantId: mongoose.Types.ObjectId,
  userId: string | mongoose.Types.ObjectId,
  monthParam?: string,
  yearParam?: string
): Promise<StaffAttendanceSummaryResult> => {
  const targetUserId = new mongoose.Types.ObjectId(userId);

  // 1. Verify target employee exists in tenant
  const user = await User.findOne({ _id: targetUserId, tenantId });
  if (!user) {
    throw new ApiError(404, 'Employee not found in this organization', 'USER_NOT_FOUND');
  }

  // 2. Resolve target month and year
  const now = new Date();
  const month = monthParam
    ? monthParam.padStart(2, '0')
    : String(now.getUTCMonth() + 1).padStart(2, '0');
  const year = yearParam ? String(yearParam) : String(now.getUTCFullYear());

  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);

  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    throw new ApiError(400, 'Month must be between 1 and 12', 'INVALID_MONTH');
  }

  if (isNaN(yearNum) || yearNum < 1970 || yearNum > 2100) {
    throw new ApiError(400, 'Invalid year provided', 'INVALID_YEAR');
  }

  const totalDays = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
  const monthPrefix = `${year}-${month}`;
  const startDate = `${monthPrefix}-01`;
  const endDate = `${monthPrefix}-${String(totalDays).padStart(2, '0')}`;

  // 3. Working Days & Weekends
  const workDaysConfig = await getWorkingDaysService(tenantId);
  const weekends = workDaysConfig.weekends || ['Sunday'];
  const alternateRules = workDaysConfig.alternateWeekendRules;

  const isAlternateWeekend = (dayName: string, dayNumber: number): boolean => {
    if (!alternateRules || !alternateRules.weeks || alternateRules.weeks.length === 0) return false;
    if (dayName !== alternateRules.day) return false;
    const weekNum = Math.ceil(dayNumber / 7);
    return alternateRules.weeks.includes(weekNum);
  };

  // 4. Official Holidays in this month
  const officialHolidays = await Holiday.find({
    tenantId,
    date: { $gte: startDate, $lte: endDate }
  });

  const officialHolidayDates = new Set(officialHolidays.map((h) => h.date));

  // Check employee joining date for mid-month proration
  const userJoiningDate = (user as any).joiningDate;
  const userJoinDateStr =
    userJoiningDate instanceof Date
      ? userJoiningDate.toISOString().split('T')[0]
      : typeof userJoiningDate === 'string'
        ? userJoiningDate
        : null;

  // If user joined during this query month, prorate active days
  const isJoinedThisMonth = !!(userJoinDateStr && userJoinDateStr.startsWith(monthPrefix));
  const joiningDay = isJoinedThisMonth ? parseInt(userJoinDateStr!.split('-')[2], 10) : 1;
  const effectiveTotalDays = isJoinedThisMonth ? totalDays - (joiningDay - 1) : totalDays;

  // Count non-working days: days that are either weekend OR official holiday
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let weekendsCount = 0;
  let nonWorkingDaysCount = 0;

  for (let d = 1; d <= totalDays; d++) {
    const dayPadded = String(d).padStart(2, '0');
    const dateStr = `${monthPrefix}-${dayPadded}`;

    // Skip crediting weekend/holiday for days before user joined
    if (isJoinedThisMonth && d < joiningDay) {
      continue;
    }

    const dateObj = new Date(`${dateStr}T00:00:00Z`);
    const dayOfWeek = dayNames[dateObj.getUTCDay()];
    const isWeekend = weekends.includes(dayOfWeek) || isAlternateWeekend(dayOfWeek, d);
    const isHoliday = officialHolidayDates.has(dateStr);

    if (isWeekend) {
      weekendsCount++;
    }
    if (isWeekend || isHoliday) {
      nonWorkingDaysCount++;
    }
  }

  const holidays = nonWorkingDaysCount;

  // 5. Fetch all attendance records for target user in this month
  const records = await Attendance.find({
    tenantId,
    userId: targetUserId,
    date: { $gte: startDate, $lte: endDate }
  });

  let presentDays = 0;
  let halfDays = 0;
  let paidLeaves = 0;
  let unpaidLeaves = 0;
  let absentDays = 0;
  let totalWorkingMinutes = 0;
  let totalOvertimeMinutes = 0;

  records.forEach((rec) => {
    switch (rec.status) {
      case 'Present':
        presentDays++;
        break;
      case 'Half Day':
        halfDays++;
        break;
      case 'Paid Leave':
        paidLeaves++;
        break;
      case 'Leave':
        unpaidLeaves++;
        break;
      case 'Absent':
        absentDays++;
        break;
    }
    totalWorkingMinutes += rec.totalMinutes || 0;
    totalOvertimeMinutes += rec.overtimeMinutes || 0;
  });

  // Payable days: presentDays + (halfDays * 0.5) + paidLeaves + holidays
  const payableDays = presentDays + halfDays * 0.5 + paidLeaves + holidays;

  // Attendance percentage: ((presentDays + halfDays * 0.5 + paidLeaves) / (effectiveTotalDays - holidays)) * 100
  const workingDays = effectiveTotalDays - holidays;
  const effectivePresent = presentDays + halfDays * 0.5 + paidLeaves;
  const attendancePercentage =
    workingDays > 0
      ? Math.round((effectivePresent / workingDays) * 10000) / 100
      : 0;

  return {
    userId: targetUserId,
    userName: user.name,
    month,
    year,
    totalDays,
    effectiveTotalDays,
    isProrated: isJoinedThisMonth,
    preJoiningDays: isJoinedThisMonth ? joiningDay - 1 : 0,
    joiningDate: userJoinDateStr,
    presentDays,
    halfDays,
    paidLeaves,
    unpaidLeaves,
    absentDays,
    holidays,
    weekendsCount,
    officialHolidaysCount: officialHolidays.length,
    payableDays,
    attendancePercentage,
    totalWorkingMinutes,
    totalOvertimeMinutes,
    records: records.map((r: any) => ({
      date: r.date,
      status: r.status,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      totalMinutes: r.totalMinutes,
      overtimeMinutes: r.overtimeMinutes,
      notes: r.notes
    }))
  };
};

export interface AttendanceExportRow {
  employeeName: string;
  username: string;
  present: number;
  halfDay: number;
  absent: number;
  paidLeave: number;
  payableDays: number;
  overtimeHours: number;
}

export const exportMonthlyAttendanceService = async (
  tenantId: mongoose.Types.ObjectId,
  monthParam?: string,
  yearParam?: string
): Promise<{ filename: string; csv: string; rows: AttendanceExportRow[] }> => {
  const now = new Date();
  const month = monthParam
    ? monthParam.padStart(2, '0')
    : String(now.getUTCMonth() + 1).padStart(2, '0');
  const year = yearParam ? String(yearParam) : String(now.getUTCFullYear());

  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);

  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    throw new ApiError(400, 'Month must be between 1 and 12', 'INVALID_MONTH');
  }

  if (isNaN(yearNum) || yearNum < 1970 || yearNum > 2100) {
    throw new ApiError(400, 'Invalid year provided', 'INVALID_YEAR');
  }

  const totalDays = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
  const monthPrefix = `${year}-${month}`;
  const startDate = `${monthPrefix}-01`;
  const endDate = `${monthPrefix}-${String(totalDays).padStart(2, '0')}`;

  const workDaysConfig = await getWorkingDaysService(tenantId);
  const weekends = workDaysConfig.weekends || ['Sunday'];
  const alternateRules = workDaysConfig.alternateWeekendRules;

  const isAlternateWeekend = (dayName: string, dayNumber: number): boolean => {
    if (!alternateRules || !alternateRules.weeks || alternateRules.weeks.length === 0) return false;
    if (dayName !== alternateRules.day) return false;
    const weekNum = Math.ceil(dayNumber / 7);
    return alternateRules.weeks.includes(weekNum);
  };

  const officialHolidays = await Holiday.find({
    tenantId,
    date: { $gte: startDate, $lte: endDate }
  });
  const officialHolidayDates = new Set(officialHolidays.map((h) => h.date));

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let nonWorkingDaysCount = 0;

  for (let d = 1; d <= totalDays; d++) {
    const dayPadded = String(d).padStart(2, '0');
    const dateStr = `${monthPrefix}-${dayPadded}`;
    const dateObj = new Date(`${dateStr}T00:00:00Z`);
    const dayOfWeek = dayNames[dateObj.getUTCDay()];
    const isWeekend = weekends.includes(dayOfWeek) || isAlternateWeekend(dayOfWeek, d);
    const isHoliday = officialHolidayDates.has(dateStr);

    if (isWeekend || isHoliday) {
      nonWorkingDaysCount++;
    }
  }

  const holidays = nonWorkingDaysCount;

  const employees = await User.find({ tenantId, isActive: true }).sort({ name: 1 });

  const records = await Attendance.find({
    tenantId,
    date: { $gte: startDate, $lte: endDate }
  });

  const userRecordsMap = new Map<string, typeof records>();
  records.forEach((rec) => {
    const uKey = rec.userId.toString();
    const list = userRecordsMap.get(uKey) || [];
    list.push(rec);
    userRecordsMap.set(uKey, list);
  });

  const escapeCsv = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows: AttendanceExportRow[] = [];
  const csvLines: string[] = [
    'Employee Name,Username,Present,Half Day,Absent,Paid Leave,Payable Days,Overtime (Hrs)'
  ];

  for (const emp of employees) {
    const empRecords = userRecordsMap.get(emp._id.toString()) || [];
    let presentDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let paidLeaves = 0;
    let totalOvertimeMinutes = 0;

    empRecords.forEach((rec) => {
      switch (rec.status) {
        case 'Present':
          presentDays++;
          break;
        case 'Half Day':
          halfDays++;
          break;
        case 'Paid Leave':
          paidLeaves++;
          break;
        case 'Absent':
          absentDays++;
          break;
      }
      totalOvertimeMinutes += rec.overtimeMinutes || 0;
    });

    const userJoiningDate = (emp as any).joiningDate;
    const userJoinDateStr =
      userJoiningDate instanceof Date
        ? userJoiningDate.toISOString().split('T')[0]
        : typeof userJoiningDate === 'string'
          ? userJoiningDate
          : null;
    const isJoinedThisMonth = Boolean(userJoinDateStr && userJoinDateStr.startsWith(monthPrefix));
    const joiningDay = isJoinedThisMonth ? parseInt(userJoinDateStr!.split('-')[2], 10) : 1;

    let empHolidays = holidays;
    if (isJoinedThisMonth) {
      empHolidays = 0;
      for (let d = joiningDay; d <= totalDays; d++) {
        const dayPadded = String(d).padStart(2, '0');
        const dateStr = `${monthPrefix}-${dayPadded}`;
        const dateObj = new Date(`${dateStr}T00:00:00Z`);
        const dayOfWeek = dayNames[dateObj.getUTCDay()];
        const isWeekend = weekends.includes(dayOfWeek) || isAlternateWeekend(dayOfWeek, d);
        const isHoliday = officialHolidayDates.has(dateStr);
        if (isWeekend || isHoliday) {
          empHolidays++;
        }
      }
    }

    const payableDays = presentDays + halfDays * 0.5 + paidLeaves + empHolidays;
    const overtimeHours = Math.round((totalOvertimeMinutes / 60) * 100) / 100;

    rows.push({
      employeeName: emp.name,
      username: emp.username,
      present: presentDays,
      halfDay: halfDays,
      absent: absentDays,
      paidLeave: paidLeaves,
      payableDays,
      overtimeHours
    });

    csvLines.push(
      [
        escapeCsv(emp.name),
        escapeCsv(emp.username),
        presentDays,
        halfDays,
        absentDays,
        paidLeaves,
        payableDays,
        overtimeHours
      ].join(',')
    );
  }

  const filename = `attendance-export-${year}-${month}.csv`;
  const csv = csvLines.join('\n');

  return { filename, csv, rows };
};



