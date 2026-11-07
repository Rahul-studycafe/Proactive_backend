import mongoose from 'mongoose';
import { Client } from '../modules/clients/schemas';
import { Task } from '../models/Task';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
import { Attendance } from '../models/Attendance';
import {
  getClientDistributionService,
  getStaffPerformanceLeaderboardService,
  getAttendanceOverviewService,
  getUpcomingHolidaysService
} from './analytics.service';
import { getRedisClient } from '../config/redis';
import { PermissionResolverService } from './permission-resolver.service';

export const getDashboardMetrics = async (
  tenantId: mongoose.Types.ObjectId,
  user?: any
) => {
  const userIdStr = user?._id ? user._id.toString() : '';
  const cacheKey = userIdStr
    ? `dashboard:overview:${tenantId.toString()}:${userIdStr}`
    : `dashboard:overview:${tenantId.toString()}`;
  const redis = getRedisClient();

  try {
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }
  } catch (err: any) {
    // Gracefully ignore Redis read errors
  }

  // 1. Resolve Effective Permissions
  let effectiveState: any = null;
  if (user && user._id) {
    try {
      effectiveState = await PermissionResolverService.resolveUserPermissions(
        userIdStr,
        tenantId.toString()
      );
    } catch (e) {
      // Ignore error, fallback
    }
  }

  const isSuperAdmin = effectiveState ? effectiveState.isSuperAdmin : true;
  const canViewClients = isSuperAdmin || Boolean(effectiveState?.permissions?.['client:view']?.allowed);
  const canViewTasks = isSuperAdmin || Boolean(effectiveState?.permissions?.['task:view']?.allowed);
  const taskScope = isSuperAdmin ? 'everything' : (effectiveState?.permissions?.['task:view']?.scope || 'everything');
  const canViewInvoices = isSuperAdmin || Boolean(effectiveState?.permissions?.['invoice:view']?.allowed);
  const canViewReceipts = isSuperAdmin || Boolean(effectiveState?.permissions?.['receipt:view']?.allowed);
  const canViewAttendanceAll = isSuperAdmin || Boolean(effectiveState?.permissions?.['attendance:view_all']?.allowed);
  const canViewAttendanceSelf = isSuperAdmin || Boolean(effectiveState?.permissions?.['attendance:view_self']?.allowed);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Task filter according to user permission scope
  const pendingTasksFilter: any = {
    tenantId,
    status: { $in: ['Pending', 'In Progress', 'Under Review'] }
  };
  const completedTasksFilter: any = {
    tenantId,
    status: 'Completed'
  };

  if (taskScope === 'assigned_only' && user?._id) {
    const userObjId = new mongoose.Types.ObjectId(userIdStr);
    const assignedClause = {
      $or: [
        { assignedUserId: userObjId },
        { assigneeIds: userObjId },
        { createdBy: userObjId }
      ]
    };
    pendingTasksFilter.$and = [assignedClause];
    completedTasksFilter.$and = [assignedClause];
  }

  // Execute queries selectively based on permissions
  const [
    totalClients,
    pendingTasks,
    overdueInvoices,
    receivablesAgg,
    unbilledTasksAgg,
    recentInvoices,
    recentReceipts,
    recentTasks,
    clientDistribution,
    staffLeaderboard,
    attendanceOverview,
    myAttendanceRecord,
    upcomingHolidays
  ] = await Promise.all([
    // Clients
    canViewClients ? Client.countDocuments({ tenantId, isActive: true }) : Promise.resolve(0),

    // Pending Tasks
    canViewTasks ? Task.countDocuments(pendingTasksFilter) : Promise.resolve(0),

    // Invoices & Receivables
    canViewInvoices
      ? Invoice.countDocuments({
          tenantId,
          status: { $in: ['Unpaid', 'Partially Paid'] },
          dueDate: { $lt: now }
        })
      : Promise.resolve(0),
    canViewInvoices
      ? Invoice.aggregate([
          {
            $match: {
              tenantId,
              status: { $in: ['Unpaid', 'Partially Paid'] }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$totals.amountDue' }
            }
          }
        ])
      : Promise.resolve([]),
    canViewInvoices
      ? Task.aggregate([
          {
            $match: {
              tenantId,
              isBilled: false,
              isBillable: true
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$billingAmount' }
            }
          }
        ])
      : Promise.resolve([]),

    // Recent Activity Streams
    canViewInvoices
      ? Invoice.find({ tenantId })
          .populate('clientId', 'name clientNumber fileNo')
          .sort({ createdAt: -1 })
          .limit(5)
          .select('invoiceNo date totals status clientId')
          .lean()
      : Promise.resolve([]),
    canViewReceipts
      ? Receipt.find({ tenantId })
          .populate('clientId', 'name clientNumber fileNo')
          .sort({ createdAt: -1 })
          .limit(5)
          .select('receiptNo date totalAmount paymentMode clientId')
          .lean()
      : Promise.resolve([]),
    canViewTasks
      ? Task.find(completedTasksFilter)
          .populate('clientId', 'name')
          .sort({ updatedAt: -1 })
          .limit(5)
          .select('title status billingAmount clientId updatedAt')
          .lean()
      : Promise.resolve([]),

    // Client Distribution
    canViewClients ? getClientDistributionService(tenantId) : Promise.resolve([]),

    // Staff Leaderboard
    getStaffPerformanceLeaderboardService(tenantId),

    // Attendance
    canViewAttendanceAll ? getAttendanceOverviewService(tenantId) : Promise.resolve(null),
    !canViewAttendanceAll && canViewAttendanceSelf && user?._id
      ? Attendance.findOne({
          tenantId,
          userId: new mongoose.Types.ObjectId(userIdStr),
          date: todayStr
        }).lean()
      : Promise.resolve(null),

    // Upcoming Holidays
    getUpcomingHolidaysService(tenantId, 5)
  ]);

  const totalReceivables =
    receivablesAgg.length > 0 && receivablesAgg[0].total
      ? Math.round(receivablesAgg[0].total * 100) / 100
      : 0;

  const totalUnbilled =
    unbilledTasksAgg.length > 0 && unbilledTasksAgg[0].total
      ? Math.round(unbilledTasksAgg[0].total * 100) / 100
      : 0;

  let myAttendanceToday: any = null;
  if (myAttendanceRecord) {
    myAttendanceToday = {
      status: myAttendanceRecord.status,
      checkIn: myAttendanceRecord.checkIn,
      checkOut: myAttendanceRecord.checkOut,
      totalMinutes: myAttendanceRecord.totalMinutes || 0
    };
  } else if (!canViewAttendanceAll && canViewAttendanceSelf) {
    myAttendanceToday = {
      status: 'Unmarked',
      checkIn: null,
      checkOut: null,
      totalMinutes: 0
    };
  }

  const result = {
    isStaffWorkspace: !canViewInvoices && !canViewAttendanceAll,
    quickStats: {
      totalClients: canViewClients ? totalClients : null,
      pendingTasks: canViewTasks ? pendingTasks : 0,
      overdueInvoices: canViewInvoices ? overdueInvoices : null,
      totalReceivables: canViewInvoices ? totalReceivables : null,
      totalUnbilled: canViewInvoices ? totalUnbilled : null
    },
    clientDistribution: canViewClients ? clientDistribution : [],
    staffLeaderboard,
    attendanceOverview,
    myAttendanceToday,
    upcomingHolidays,
    recentActivity: {
      invoices: recentInvoices,
      receipts: recentReceipts,
      completedTasks: recentTasks
    }
  };

  try {
    if (redis) {
      await redis.setex(cacheKey, 60, JSON.stringify(result));
    }
  } catch (err: any) {
    // Gracefully ignore Redis write errors
  }

  return result;
};

/**
 * High performance client summary aggregation using MongoDB $facet.
 */
export const getClientSummaryMetrics = async (
  tenantId: mongoose.Types.ObjectId,
  clientId: string
) => {
  const clientObjectId = new mongoose.Types.ObjectId(clientId);

  const [client, taskFacet, invoiceAgg, receiptAgg] = await Promise.all([
    Client.findOne({ _id: clientObjectId, tenantId }).lean(),
    Task.aggregate([
      { $match: { tenantId, clientId: clientObjectId } },
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          unbilled: [
            { $match: { isBilled: false, status: 'Completed' } },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                totalAmount: { $sum: '$billingAmount' }
              }
            }
          ]
        }
      }
    ]),
    Invoice.aggregate([
      {
        $match: {
          tenantId,
          clientId: clientObjectId,
          status: { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: null,
          totalInvoiced: { $sum: '$totals.grandTotal' },
          totalDue: { $sum: '$totals.amountDue' },
          count: { $sum: 1 }
        }
      }
    ]),
    Receipt.aggregate([
      { $match: { tenantId, clientId: clientObjectId } },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const openingBalance = client?.openingBalance || 0;
  const totalInvoiced = invoiceAgg[0]?.totalInvoiced || 0;
  const totalPaid = receiptAgg[0]?.totalPaid || 0;
  const totalDue = invoiceAgg[0]?.totalDue || 0;
  const currentLedgerBalance =
    Math.round((openingBalance + totalInvoiced - totalPaid) * 100) / 100;

  const statusMap: Record<string, number> = {};
  if (taskFacet[0]?.byStatus) {
    for (const item of taskFacet[0].byStatus) {
      statusMap[item._id] = item.count;
    }
  }

  const unbilledCount = taskFacet[0]?.unbilled[0]?.count || 0;
  const unbilledAmount = taskFacet[0]?.unbilled[0]?.totalAmount || 0;

  return {
    client: {
      _id: client?._id,
      name: client?.name,
      clientNumber: client?.clientNumber || client?.fileNo,
      fileNo: client?.clientNumber || client?.fileNo
    },
    tasks: {
      pending: (statusMap['Pending'] || 0) + (statusMap['In Progress'] || 0) + (statusMap['Under Review'] || 0),
      completed: statusMap['Completed'] || 0,
      onHold: statusMap['On Hold'] || 0,
      unbilledCount,
      unbilledAmount
    },
    financials: {
      openingBalance,
      totalInvoiced,
      totalPaid,
      totalDue,
      currentLedgerBalance
    }
  };
};
