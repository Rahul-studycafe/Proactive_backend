import mongoose from 'mongoose';
import { Client } from '../modules/clients/schemas/client.schema';
import { User } from '../modules/auth/schemas';
import { Task } from '../models/Task';
import { Attendance } from '../models/Attendance';
import { Holiday } from '../models/Holiday';

export interface ClientEntityDistributionItem {
  entityType: string;
  count: number;
  percentage: number;
}

/**
 * Phase 67: Client Entity Distribution Aggregation
 */
export const getClientDistributionService = async (
  tenantId: mongoose.Types.ObjectId
): Promise<ClientEntityDistributionItem[]> => {
  const distribution = await Client.aggregate([
    { $match: { tenantId, isActive: true } },
    { $group: { _id: '$entityType', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  const totalClients = distribution.reduce((sum, item) => sum + item.count, 0);

  return distribution.map((item) => {
    const count = item.count || 0;
    const percentage = totalClients > 0 ? Math.round((count / totalClients) * 100) : 0;
    return {
      entityType: item._id || 'Other',
      count,
      percentage
    };
  });
};

export interface StaffPerformanceItem {
  userId: mongoose.Types.ObjectId;
  name: string;
  username: string;
  totalAssigned: number;
  completed: number;
  completionPercentage: number;
  rank: number;
}

/**
 * Phase 68: Best Performer & Staff Leaderboard Aggregation
 */
export const getStaffPerformanceLeaderboardService = async (
  tenantId: mongoose.Types.ObjectId,
  from?: string,
  to?: string
): Promise<StaffPerformanceItem[]> => {
  const matchStage: any = { tenantId };

  // Default to the start of current month if no date bounds are specified to prevent unbounded collection scans
  const effectiveFrom = from || (!to ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() : undefined);

  if (effectiveFrom || to) {
    matchStage.createdAt = {};
    if (effectiveFrom) {
      matchStage.createdAt.$gte = new Date(effectiveFrom);
    }
    if (to) {
      matchStage.createdAt.$lte = new Date(to);
    }
  }

  // 1. Group tasks by assigneeIds with disk spillover protection for large datasets
  const taskStats = await Task.aggregate(
    [
      { $match: matchStage },
      { $unwind: '$assigneeIds' },
      {
        $group: {
          _id: '$assigneeIds',
          totalAssigned: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
          }
        }
      }
    ],
    { allowDiskUse: true }
  );

  const statsMap = new Map<string, { totalAssigned: number; completed: number }>();
  taskStats.forEach((stat) => {
    statsMap.set(stat._id.toString(), {
      totalAssigned: stat.totalAssigned,
      completed: stat.completed
    });
  });

  // 2. Fetch all active staff in tenant
  const activeStaff = await User.find({ tenantId, isActive: true })
    .select('_id name username')
    .lean();

  const leaderboard: StaffPerformanceItem[] = activeStaff.map((staff) => {
    const s = statsMap.get(staff._id.toString()) || { totalAssigned: 0, completed: 0 };
    const completionPercentage =
      s.totalAssigned > 0 ? Math.round((s.completed / s.totalAssigned) * 100) : 0;

    return {
      userId: staff._id as mongoose.Types.ObjectId,
      name: staff.name,
      username: staff.username,
      totalAssigned: s.totalAssigned,
      completed: s.completed,
      completionPercentage,
      rank: 0
    };
  });

  // 3. Sort by completion percentage descending, then completed count descending
  leaderboard.sort((a, b) => {
    if (b.completionPercentage !== a.completionPercentage) {
      return b.completionPercentage - a.completionPercentage;
    }
    if (b.completed !== a.completed) {
      return b.completed - a.completed;
    }
    return b.totalAssigned - a.totalAssigned;
  });

  // 4. Assign ranks
  leaderboard.forEach((item, index) => {
    item.rank = index + 1;
  });

  return leaderboard;
};

export interface AttendanceKPIOverview {
  date: string;
  totalStaff: number;
  presentToday: number;
  halfDayToday: number;
  onLeaveToday: number;
  absentToday: number;
  unmarkedToday: number;
  presenceRate: number;
}

/**
 * Phase 69: Attendance KPI Overview Aggregation
 */
export const getAttendanceOverviewService = async (
  tenantId: mongoose.Types.ObjectId,
  dateStr?: string,
  departmentId?: string
): Promise<AttendanceKPIOverview> => {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];

  let totalStaff = 0;
  let records: { status: string }[] = [];

  if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
    const deptUsers = await User.find({
      tenantId,
      isActive: true,
      departmentId: new mongoose.Types.ObjectId(departmentId)
    }).select('_id');
    const userIds = deptUsers.map((u) => u._id);
    totalStaff = deptUsers.length;
    records = await Attendance.find({
      tenantId,
      date: targetDate,
      userId: { $in: userIds }
    }).select('status');
  } else {
    const [staffCount, attRecords] = await Promise.all([
      User.countDocuments({ tenantId, isActive: true }),
      Attendance.find({ tenantId, date: targetDate }).select('status')
    ]);
    totalStaff = staffCount;
    records = attRecords;
  }

  let presentToday = 0;
  let halfDayToday = 0;
  let onLeaveToday = 0;
  let absentToday = 0;

  records.forEach((rec) => {
    switch (rec.status) {
      case 'Present':
        presentToday++;
        break;
      case 'Half Day':
        halfDayToday++;
        break;
      case 'Leave':
      case 'Paid Leave':
        onLeaveToday++;
        break;
      case 'Absent':
        absentToday++;
        break;
    }
  });

  const markedCount = presentToday + halfDayToday + onLeaveToday + absentToday;
  const unmarkedToday = Math.max(totalStaff - markedCount, 0);

  // Presence rate: percentage of staff present (half day counts as 0.5)
  const presenceRate =
    totalStaff > 0
      ? Math.round(((presentToday + halfDayToday * 0.5) / totalStaff) * 100)
      : 0;

  return {
    date: targetDate,
    totalStaff,
    presentToday,
    halfDayToday,
    onLeaveToday,
    absentToday,
    unmarkedToday,
    presenceRate
  };
};

/**
 * Helper to fetch upcoming holidays
 */
export const getUpcomingHolidaysService = async (
  tenantId: mongoose.Types.ObjectId,
  limit: number = 5
) => {
  const todayStr = new Date().toISOString().split('T')[0];
  return Holiday.find({
    tenantId,
    date: { $gte: todayStr }
  })
    .sort({ date: 1 })
    .limit(limit)
    .select('name date type description')
    .lean();
};
