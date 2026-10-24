import mongoose from 'mongoose';
import { Client } from '../modules/clients/schemas';
import { Task } from '../models/Task';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
import {
  getClientDistributionService,
  getStaffPerformanceLeaderboardService,
  getAttendanceOverviewService,
  getUpcomingHolidaysService
} from './analytics.service';
import { getRedisClient } from '../config/redis';

export const getDashboardMetrics = async (tenantId: mongoose.Types.ObjectId) => {
  const cacheKey = `dashboard:overview:${tenantId.toString()}`;
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

  const now = new Date();

  // Execute all Phase 1 & Phase 2 queries in parallel for maximum performance
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
    upcomingHolidays
  ] = await Promise.all([
    Client.countDocuments({ tenantId, isActive: true }),
    Task.countDocuments({
      tenantId,
      status: { $in: ['Pending', 'In Progress', 'Under Review'] }
    }),
    Invoice.countDocuments({
      tenantId,
      status: { $in: ['Unpaid', 'Partially Paid'] },
      dueDate: { $lt: now }
    }),
    Invoice.aggregate([
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
    ]),
    Task.aggregate([
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
    ]),
    Invoice.find({ tenantId })
      .populate('clientId', 'name fileNo')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('invoiceNo date totals status clientId')
      .lean(),
    Receipt.find({ tenantId })
      .populate('clientId', 'name fileNo')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('receiptNo date totalAmount paymentMode clientId')
      .lean(),
    Task.find({ tenantId, status: 'Completed' })
      .populate('clientId', 'name')
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('title status billingAmount clientId updatedAt')
      .lean(),
    getClientDistributionService(tenantId),
    getStaffPerformanceLeaderboardService(tenantId),
    getAttendanceOverviewService(tenantId),
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

  const result = {
    quickStats: {
      totalClients,
      pendingTasks,
      overdueInvoices,
      totalReceivables,
      totalUnbilled
    },
    clientDistribution,
    staffLeaderboard,
    attendanceOverview,
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
      fileNo: client?.fileNo
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
