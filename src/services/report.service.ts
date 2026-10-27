import mongoose, { Types } from 'mongoose';
import ExcelJS from 'exceljs';
import { Response } from 'express';
import { Task } from '../models/Task';
import { DSC } from '../models/DSC';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
import { Client } from '../modules/clients/schemas/client.schema';
import { Service } from '../modules/services/schemas/service.schema';
import { ApiError } from '../common/errors/api-error';

// ─── Phase 111: Modular Query Helpers & Pagination ─────────────

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export const parsePagination = (query: any): PaginationParams => {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.max(1, Math.min(1000, parseInt(query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const parseDateFilter = (start?: string, end?: string): Record<string, any> | null => {
  const filter: Record<string, any> = {};
  if (start) {
    const s = new Date(start);
    if (!isNaN(s.getTime())) filter.$gte = s;
  }
  if (end) {
    const e = new Date(end);
    if (!isNaN(e.getTime())) {
      // Set to end of day if only YYYY-MM-DD was provided
      if (end.length <= 10) e.setHours(23, 59, 59, 999);
      filter.$lte = e;
    }
  }
  return Object.keys(filter).length > 0 ? filter : null;
};

// ─── Phase 112: Operational & Task Reporting ───────────────────

export interface TaskReportQuery {
  serviceId?: string;
  assignedUserId?: string;
  clientId?: string;
  status?: string;
  priority?: string;
  startDate?: string;
  endDate?: string;
  dueDateStart?: string;
  dueDateEnd?: string;
  page?: string;
  limit?: string;
}

export const getTaskReport = async (tenantId: Types.ObjectId, query: TaskReportQuery) => {
  const { page, limit, skip } = parsePagination(query);
  const match: Record<string, any> = { tenantId: new Types.ObjectId(tenantId) };

  if (query.serviceId && Types.ObjectId.isValid(query.serviceId)) {
    match.serviceId = new Types.ObjectId(query.serviceId);
  }
  if (query.clientId && Types.ObjectId.isValid(query.clientId)) {
    match.clientId = new Types.ObjectId(query.clientId);
  }
  if (query.assignedUserId && Types.ObjectId.isValid(query.assignedUserId)) {
    match.assigneeIds = new Types.ObjectId(query.assignedUserId);
  }
  if (query.status) {
    match.status = query.status;
  }
  if (query.priority) {
    match.priority = query.priority;
  }

  const dateFilter = parseDateFilter(
    query.dueDateStart || query.startDate,
    query.dueDateEnd || query.endDate
  );
  if (dateFilter) {
    match.dueDate = dateFilter;
  }

  const now = new Date();

  const [result] = await Task.aggregate([
    { $match: match },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalTasks: { $sum: 1 },
              completedTasks: {
                $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
              },
              overdueTasks: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$status', 'Completed'] },
                        { $ne: ['$status', 'Cancelled'] },
                        { $lt: ['$dueDate', now] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              totalTimeLogged: { $sum: { $ifNull: ['$timeLogged', 0] } }
            }
          }
        ],
        totalCount: [{ $count: 'count' }],
        data: [
          { $sort: { dueDate: 1, createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'clients',
              localField: 'clientId',
              foreignField: '_id',
              as: 'clientDoc'
            }
          },
          {
            $unwind: {
              path: '$clientDoc',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $lookup: {
              from: 'services',
              localField: 'serviceId',
              foreignField: '_id',
              as: 'serviceDoc'
            }
          },
          {
            $unwind: {
              path: '$serviceDoc',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'assigneeIds',
              foreignField: '_id',
              as: 'assignees'
            }
          },
          {
            $project: {
              _id: 1,
              status: 1,
              priority: 1,
              dueDate: 1,
              timeLogged: { $ifNull: ['$timeLogged', 0] },
              billableAmount: { $ifNull: ['$billingAmount', 0] },
              isBilled: 1,
              createdAt: 1,
              client: {
                _id: '$clientDoc._id',
                name: '$clientDoc.name',
                fileNo: '$clientDoc.fileNo'
              },
              service: {
                _id: '$serviceDoc._id',
                name: '$serviceDoc.name'
              },
              assignees: {
                $map: {
                  input: '$assignees',
                  as: 'u',
                  in: { _id: '$$u._id', name: '$$u.name' }
                }
              }
            }
          }
        ]
      }
    }
  ]);

  const rawSummary = result.summary?.[0] || {
    totalTasks: 0,
    completedTasks: 0,
    overdueTasks: 0,
    totalTimeLogged: 0
  };
  const total = result.totalCount?.[0]?.count || 0;
  const completionVelocity =
    rawSummary.totalTasks > 0
      ? Math.round((rawSummary.completedTasks / rawSummary.totalTasks) * 100)
      : 0;

  return {
    summary: {
      totalTasks: rawSummary.totalTasks,
      completedTasks: rawSummary.completedTasks,
      overdueTasks: rawSummary.overdueTasks,
      totalTimeLogged: rawSummary.totalTimeLogged,
      completionVelocity
    },
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    data: result.data || []
  };
};

export const getServiceReport = async (tenantId: Types.ObjectId, query: any) => {
  const match: Record<string, any> = {
    tenantId: new Types.ObjectId(tenantId),
    isActive: true
  };

  const serviceMatch: Record<string, any> = {};
  if (query.serviceId && Types.ObjectId.isValid(query.serviceId)) {
    serviceMatch['subscribedServices.serviceId'] = new Types.ObjectId(query.serviceId);
  }

  const aggregatePipeline: any[] = [
    { $match: match },
    { $unwind: '$subscribedServices' },
    ...(Object.keys(serviceMatch).length > 0 ? [{ $match: serviceMatch }] : []),
    {
      $lookup: {
        from: 'services',
        localField: 'subscribedServices.serviceId',
        foreignField: '_id',
        as: 'service'
      }
    },
    { $unwind: '$service' },
    {
      $group: {
        _id: '$service._id',
        serviceName: { $first: '$service.name' },
        frequency: { $first: '$service.frequency.type' },
        sacCode: { $first: '$service.sacCode' },
        defaultBillingRate: { $first: '$service.defaultBillingRate' },
        clientCount: { $sum: 1 },
        totalRevenueYield: {
          $sum: {
            $ifNull: ['$subscribedServices.customPrice', '$service.defaultBillingRate']
          }
        },
        clients: {
          $push: {
            clientId: '$_id',
            name: '$name',
            customPrice: '$subscribedServices.customPrice'
          }
        }
      }
    },
    { $sort: { clientCount: -1, serviceName: 1 } }
  ];

  const serviceData = await Client.aggregate(aggregatePipeline);

  const totalActiveSubscriptions = serviceData.reduce((acc, curr) => acc + curr.clientCount, 0);
  const totalMonthlyRecurringRevenue = serviceData.reduce(
    (acc, curr) => acc + curr.totalRevenueYield,
    0
  );

  return {
    summary: {
      totalServicesOffered: serviceData.length,
      totalActiveSubscriptions,
      totalMonthlyRecurringRevenue
    },
    data: serviceData
  };
};

export interface DscReportQuery {
  days?: string;
  status?: string;
  clientId?: string;
  page?: string;
  limit?: string;
}

export const getDscReport = async (tenantId: Types.ObjectId, query: DscReportQuery) => {
  const { page, limit, skip } = parsePagination(query);
  const match: Record<string, any> = { tenantId: new Types.ObjectId(tenantId) };

  if (query.clientId && Types.ObjectId.isValid(query.clientId)) {
    match.clientId = new Types.ObjectId(query.clientId);
  }
  if (query.status) {
    match.status = query.status;
  }

  const daysNum = query.days ? parseInt(query.days, 10) : undefined;
  if (daysNum && !isNaN(daysNum)) {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + daysNum);
    match.expiryDate = { $lte: horizon };
  }

  const now = new Date();

  const [result] = await DSC.aggregate([
    { $match: match },
    {
      $addFields: {
        daysRemaining: {
          $ceil: {
            $divide: [{ $subtract: ['$expiryDate', now] }, 1000 * 60 * 60 * 24]
          }
        }
      }
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalTokens: { $sum: 1 },
              expiringIn30Days: {
                $sum: {
                  $cond: [
                    { $and: [{ $gte: ['$daysRemaining', 0] }, { $lte: ['$daysRemaining', 30] }] },
                    1,
                    0
                  ]
                }
              },
              expiringIn60Days: {
                $sum: {
                  $cond: [
                    { $and: [{ $gt: ['$daysRemaining', 30] }, { $lte: ['$daysRemaining', 60] }] },
                    1,
                    0
                  ]
                }
              },
              expiringIn90Days: {
                $sum: {
                  $cond: [
                    { $and: [{ $gt: ['$daysRemaining', 60] }, { $lte: ['$daysRemaining', 90] }] },
                    1,
                    0
                  ]
                }
              },
              expiringIn180Days: {
                $sum: {
                  $cond: [
                    { $and: [{ $gt: ['$daysRemaining', 90] }, { $lte: ['$daysRemaining', 180] }] },
                    1,
                    0
                  ]
                }
              },
              expired: {
                $sum: { $cond: [{ $lt: ['$daysRemaining', 0] }, 1, 0] }
              }
            }
          }
        ],
        totalCount: [{ $count: 'count' }],
        data: [
          { $sort: { expiryDate: 1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'clients',
              localField: 'clientId',
              foreignField: '_id',
              as: 'client'
            }
          },
          {
            $project: {
              _id: 1,
              certificateName: 1,
              certificateClass: 1,
              tokenType: 1,
              tokenSerialNumber: 1,
              issuingAuthority: 1,
              physicalLocation: 1,
              status: 1,
              currentHolderName: 1,
              expiryDate: 1,
              issueDate: 1,
              daysRemaining: 1,
              client: {
                _id: { $arrayElemAt: ['$client._id', 0] },
                name: { $arrayElemAt: ['$client.name', 0] }
              }
            }
          }
        ]
      }
    }
  ]);

  const rawSummary = result.summary?.[0] || {
    totalTokens: 0,
    expiringIn30Days: 0,
    expiringIn60Days: 0,
    expiringIn90Days: 0,
    expiringIn180Days: 0,
    expired: 0
  };
  const total = result.totalCount?.[0]?.count || 0;

  return {
    summary: rawSummary,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    data: result.data || []
  };
};

// ─── Phase 113: Financial & Revenue Reporting ──────────────────

export interface InvoiceReportQuery {
  billingEntityId?: string;
  status?: string;
  paymentStatus?: string;
  clientId?: string;
  startDate?: string;
  endDate?: string;
  page?: string;
  limit?: string;
}

export const getInvoiceReport = async (tenantId: Types.ObjectId, query: InvoiceReportQuery) => {
  const { page, limit, skip } = parsePagination(query);
  const match: Record<string, any> = { tenantId: new Types.ObjectId(tenantId) };

  if (query.billingEntityId && Types.ObjectId.isValid(query.billingEntityId)) {
    match.billingEntityId = new Types.ObjectId(query.billingEntityId);
  }
  if (query.clientId && Types.ObjectId.isValid(query.clientId)) {
    match.clientId = new Types.ObjectId(query.clientId);
  }
  const status = query.status || query.paymentStatus;
  if (status) {
    match.status = status;
  }

  const dateFilter = parseDateFilter(query.startDate, query.endDate);
  if (dateFilter) {
    match.date = dateFilter;
  }

  const [result] = await Invoice.aggregate([
    { $match: match },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalInvoiced: { $sum: '$totals.grandTotal' },
              totalTaxable: { $sum: '$totals.totalTaxable' },
              totalDiscount: { $sum: '$totals.totalDiscount' },
              totalTax: { $sum: '$totals.totalGst' },
              totalPaid: { $sum: '$totals.amountPaid' },
              totalDue: { $sum: '$totals.amountDue' },
              invoiceCount: { $sum: 1 }
            }
          }
        ],
        totalCount: [{ $count: 'count' }],
        data: [
          { $sort: { date: -1, invoiceNo: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'clients',
              localField: 'clientId',
              foreignField: '_id',
              as: 'client'
            }
          },
          {
            $lookup: {
              from: 'billingentities',
              localField: 'billingEntityId',
              foreignField: '_id',
              as: 'billingEntity'
            }
          },
          {
            $project: {
              _id: 1,
              invoiceNo: 1,
              date: 1,
              dueDate: 1,
              status: 1,
              totals: 1,
              client: {
                _id: { $arrayElemAt: ['$client._id', 0] },
                name: { $arrayElemAt: ['$client.name', 0] },
                gstin: { $arrayElemAt: ['$client.gstin', 0] }
              },
              billingEntity: {
                _id: { $arrayElemAt: ['$billingEntity._id', 0] },
                name: { $arrayElemAt: ['$billingEntity.entityName', 0] }
              }
            }
          }
        ]
      }
    }
  ]);

  const rawSummary = result.summary?.[0] || {
    totalInvoiced: 0,
    totalTaxable: 0,
    totalDiscount: 0,
    totalTax: 0,
    totalPaid: 0,
    totalDue: 0,
    invoiceCount: 0
  };
  const total = result.totalCount?.[0]?.count || 0;

  return {
    summary: rawSummary,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    data: result.data || []
  };
};

export interface ReceiptReportQuery {
  paymentMode?: string;
  clientId?: string;
  startDate?: string;
  endDate?: string;
  page?: string;
  limit?: string;
}

export const getReceiptReport = async (tenantId: Types.ObjectId, query: ReceiptReportQuery) => {
  const { page, limit, skip } = parsePagination(query);
  const match: Record<string, any> = { tenantId: new Types.ObjectId(tenantId) };

  if (query.paymentMode) {
    match.paymentMode = query.paymentMode;
  }
  if (query.clientId && Types.ObjectId.isValid(query.clientId)) {
    match.clientId = new Types.ObjectId(query.clientId);
  }
  const dateFilter = parseDateFilter(query.startDate, query.endDate);
  if (dateFilter) {
    match.date = dateFilter;
  }

  const [result] = await Receipt.aggregate([
    { $match: match },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalCollected: { $sum: '$totalAmount' },
              totalTds: { $sum: '$tdsAmount' },
              totalDiscount: { $sum: '$discountAmount' },
              totalReceipts: { $sum: 1 }
            }
          }
        ],
        byPaymentMode: [
          {
            $group: {
              _id: '$paymentMode',
              amount: { $sum: '$totalAmount' }
            }
          }
        ],
        totalCount: [{ $count: 'count' }],
        data: [
          { $sort: { date: -1, receiptNo: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'clients',
              localField: 'clientId',
              foreignField: '_id',
              as: 'client'
            }
          },
          {
            $project: {
              _id: 1,
              receiptNo: 1,
              date: 1,
              paymentMode: 1,
              referenceNumber: 1,
              totalAmount: 1,
              tdsAmount: 1,
              discountAmount: 1,
              unallocatedAmount: 1,
              settlements: 1,
              client: {
                _id: { $arrayElemAt: ['$client._id', 0] },
                name: { $arrayElemAt: ['$client.name', 0] }
              }
            }
          }
        ]
      }
    }
  ]);

  const rawSummary = result.summary?.[0] || {
    totalCollected: 0,
    totalTds: 0,
    totalDiscount: 0,
    totalReceipts: 0
  };
  const byPaymentModeMap: Record<string, number> = {};
  (result.byPaymentMode || []).forEach((item: any) => {
    if (item._id) byPaymentModeMap[item._id] = item.amount;
  });

  const total = result.totalCount?.[0]?.count || 0;

  return {
    summary: {
      ...rawSummary,
      byPaymentMode: byPaymentModeMap
    },
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    data: result.data || []
  };
};

export interface GstSummaryQuery {
  startDate?: string;
  endDate?: string;
  billingEntityId?: string;
  page?: string;
  limit?: string;
}

export const getGstSummaryReport = async (tenantId: Types.ObjectId, query: GstSummaryQuery) => {
  const { page, limit, skip } = parsePagination(query);
  const match: Record<string, any> = {
    tenantId: new Types.ObjectId(tenantId),
    status: { $ne: 'Cancelled' }
  };

  if (query.billingEntityId && Types.ObjectId.isValid(query.billingEntityId)) {
    match.billingEntityId = new Types.ObjectId(query.billingEntityId);
  }
  const dateFilter = parseDateFilter(query.startDate, query.endDate);
  if (dateFilter) {
    match.date = dateFilter;
  }

  const [result] = await Invoice.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'clients',
        localField: 'clientId',
        foreignField: '_id',
        as: 'client'
      }
    },
    { $unwind: '$client' },
    { $unwind: '$items' },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalTaxableValue: { $sum: '$items.taxableAmount' },
              totalGstAmount: { $sum: '$items.gstAmount' },
              totalInvoiceValue: { $sum: '$items.total' },
              b2bCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$client.gstin', null] },
                        { $ne: ['$client.gstin', ''] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              b2cCount: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ['$client.gstin', null] },
                        { $eq: ['$client.gstin', ''] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ],
        totalCount: [{ $count: 'count' }],
        data: [
          { $sort: { date: -1, invoiceNo: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              invoiceNo: 1,
              invoiceDate: '$date',
              clientId: '$client._id',
              clientName: '$client.name',
              clientGstin: '$client.gstin',
              clientState: '$client.state',
              sacCode: '$items.sacCode',
              particulars: '$items.particulars',
              quantity: '$items.quantity',
              rate: '$items.rate',
              taxableAmount: '$items.taxableAmount',
              gstRate: '$items.gstPercentage',
              gstAmount: '$items.gstAmount',
              cgstAmount: { $divide: ['$items.gstAmount', 2] },
              sgstAmount: { $divide: ['$items.gstAmount', 2] },
              igstAmount: { $literal: 0 },
              totalAmount: '$items.total'
            }
          }
        ]
      }
    }
  ]);

  const rawSummary = result.summary?.[0] || {
    totalTaxableValue: 0,
    totalGstAmount: 0,
    totalInvoiceValue: 0,
    b2bCount: 0,
    b2cCount: 0
  };
  const total = result.totalCount?.[0]?.count || 0;

  return {
    summary: {
      ...rawSummary,
      totalCgst: Math.round((rawSummary.totalGstAmount / 2) * 100) / 100,
      totalSgst: Math.round((rawSummary.totalGstAmount / 2) * 100) / 100,
      totalIgst: 0
    },
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    data: result.data || []
  };
};

// ─── Phase 114: Debtors Aging Outstandings Report ───────────────

export interface DebtorsAgingQuery {
  clientId?: string;
  page?: string;
  limit?: string;
}

export const getDebtorsAgingReport = async (tenantId: Types.ObjectId, query: DebtorsAgingQuery) => {
  const { page, limit, skip } = parsePagination(query);
  const match: Record<string, any> = {
    tenantId: new Types.ObjectId(tenantId),
    status: { $in: ['Unpaid', 'Partially Paid'] },
    'totals.amountDue': { $gt: 0 }
  };

  if (query.clientId && Types.ObjectId.isValid(query.clientId)) {
    match.clientId = new Types.ObjectId(query.clientId);
  }

  const now = new Date();

  const [result] = await Invoice.aggregate([
    { $match: match },
    {
      $addFields: {
        effectiveDueDate: { $ifNull: ['$dueDate', '$date'] },
        daysOverdue: {
          $max: [
            0,
            {
              $floor: {
                $divide: [
                  { $subtract: [now, { $ifNull: ['$dueDate', '$date'] }] },
                  1000 * 60 * 60 * 24
                ]
              }
            }
          ]
        }
      }
    },
    {
      $group: {
        _id: '$clientId',
        totalDue: { $sum: '$totals.amountDue' },
        bucket0_30: {
          $sum: {
            $cond: [{ $lte: ['$daysOverdue', 30] }, '$totals.amountDue', 0]
          }
        },
        bucket31_60: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ['$daysOverdue', 30] },
                  { $lte: ['$daysOverdue', 60] }
                ]
              },
              '$totals.amountDue',
              0
            ]
          }
        },
        bucket61_90: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ['$daysOverdue', 60] },
                  { $lte: ['$daysOverdue', 90] }
                ]
              },
              '$totals.amountDue',
              0
            ]
          }
        },
        bucket90Plus: {
          $sum: {
            $cond: [{ $gt: ['$daysOverdue', 90] }, '$totals.amountDue', 0]
          }
        },
        invoicesCount: { $sum: 1 },
        oldestDueDate: { $min: '$effectiveDueDate' },
        invoices: {
          $push: {
            invoiceNo: '$invoiceNo',
            dueDate: '$effectiveDueDate',
            daysOverdue: '$daysOverdue',
            amountDue: '$totals.amountDue',
            status: '$status'
          }
        }
      }
    },
    {
      $lookup: {
        from: 'clients',
        localField: '_id',
        foreignField: '_id',
        as: 'client'
      }
    },
    {
      $project: {
        _id: 1,
        clientId: '$_id',
        clientName: { $arrayElemAt: ['$client.name', 0] },
        pan: { $arrayElemAt: ['$client.pan', 0] },
        mobile: { $arrayElemAt: ['$client.mobile', 0] },
        totalDue: 1,
        bucket0_30: 1,
        bucket31_60: 1,
        bucket61_90: 1,
        bucket90Plus: 1,
        invoicesCount: 1,
        oldestDueDate: 1,
        invoices: 1
      }
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalOutstanding: { $sum: '$totalDue' },
              totalCurrent0_30: { $sum: '$bucket0_30' },
              totalOverdue31_60: { $sum: '$bucket31_60' },
              totalCritical61_90: { $sum: '$bucket61_90' },
              totalDelinquent90Plus: { $sum: '$bucket90Plus' },
              totalDebtorsCount: { $sum: 1 }
            }
          }
        ],
        totalCount: [{ $count: 'count' }],
        data: [
          { $sort: { totalDue: -1 } },
          { $skip: skip },
          { $limit: limit }
        ]
      }
    }
  ]);

  const rawSummary = result.summary?.[0] || {
    totalOutstanding: 0,
    totalCurrent0_30: 0,
    totalOverdue31_60: 0,
    totalCritical61_90: 0,
    totalDelinquent90Plus: 0,
    totalDebtorsCount: 0
  };
  const total = result.totalCount?.[0]?.count || 0;

  return {
    summary: rawSummary,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    data: result.data || []
  };
};

// ─── Phase 115: High-Performance Streaming Excel Export ────────

export const streamReportExcel = async (
  tenantId: Types.ObjectId,
  reportType: string,
  query: any,
  res: Response
) => {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${reportType}_export_${Date.now()}.xlsx"`
  );

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
  const worksheet = workbook.addWorksheet('Report');

  const styleHeader = () => {
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }
    };
    headerRow.commit();
  };

  switch (reportType) {
    case 'tasks': {
      worksheet.columns = [
        { header: 'Task ID', key: 'id', width: 26 },
        { header: 'Client', key: 'client', width: 25 },
        { header: 'Service', key: 'service', width: 25 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Priority', key: 'priority', width: 14 },
        { header: 'Due Date', key: 'dueDate', width: 16 },
        { header: 'Time Logged (m)', key: 'timeLogged', width: 16 },
        { header: 'Billable (₹)', key: 'billableAmount', width: 16 }
      ];
      styleHeader();

      // Retrieve full data matching filters using large limit for streaming
      const report = await getTaskReport(tenantId, { ...query, page: '1', limit: '10000' });
      for (const row of report.data) {
        worksheet
          .addRow({
            id: row._id?.toString(),
            client: row.client?.name || 'N/A',
            service: row.service?.name || 'N/A',
            status: row.status,
            priority: row.priority,
            dueDate: row.dueDate ? new Date(row.dueDate).toLocaleDateString() : 'N/A',
            timeLogged: row.timeLogged,
            billableAmount: row.billableAmount
          })
          .commit();
      }
      break;
    }

    case 'services': {
      worksheet.columns = [
        { header: 'Service Name', key: 'name', width: 30 },
        { header: 'Frequency', key: 'frequency', width: 16 },
        { header: 'SAC Code', key: 'sacCode', width: 16 },
        { header: 'Default Rate (₹)', key: 'rate', width: 16 },
        { header: 'Subscribed Clients', key: 'clientCount', width: 18 },
        { header: 'Revenue Yield (₹)', key: 'yield', width: 18 }
      ];
      styleHeader();

      const report = await getServiceReport(tenantId, query);
      for (const row of report.data) {
        worksheet
          .addRow({
            name: row.serviceName,
            frequency: row.frequency || 'N/A',
            sacCode: row.sacCode || 'N/A',
            rate: row.defaultBillingRate || 0,
            clientCount: row.clientCount,
            yield: row.totalRevenueYield
          })
          .commit();
      }
      break;
    }

    case 'dsc-renewals': {
      worksheet.columns = [
        { header: 'Certificate Name', key: 'name', width: 28 },
        { header: 'Client', key: 'client', width: 25 },
        { header: 'Class', key: 'class', width: 12 },
        { header: 'Token Type', key: 'tokenType', width: 16 },
        { header: 'Serial No', key: 'serial', width: 18 },
        { header: 'Authority', key: 'authority', width: 16 },
        { header: 'Location', key: 'location', width: 20 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Expiry Date', key: 'expiry', width: 16 },
        { header: 'Days Remaining', key: 'days', width: 16 },
        { header: 'Current Holder', key: 'holder', width: 20 }
      ];
      styleHeader();

      const report = await getDscReport(tenantId, { ...query, page: '1', limit: '10000' });
      for (const row of report.data) {
        worksheet
          .addRow({
            name: row.certificateName,
            client: row.client?.name || 'N/A',
            class: row.certificateClass,
            tokenType: row.tokenType,
            serial: row.tokenSerialNumber || 'N/A',
            authority: row.issuingAuthority,
            location: row.physicalLocation,
            status: row.status,
            expiry: row.expiryDate ? new Date(row.expiryDate).toLocaleDateString() : 'N/A',
            days: row.daysRemaining,
            holder: row.currentHolderName || 'In Office'
          })
          .commit();
      }
      break;
    }

    case 'invoices': {
      worksheet.columns = [
        { header: 'Invoice No', key: 'invoiceNo', width: 18 },
        { header: 'Client', key: 'client', width: 25 },
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Due Date', key: 'dueDate', width: 16 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Subtotal (₹)', key: 'subtotal', width: 16 },
        { header: 'Discount (₹)', key: 'discount', width: 16 },
        { header: 'Taxable (₹)', key: 'taxable', width: 16 },
        { header: 'Tax (₹)', key: 'tax', width: 16 },
        { header: 'Paid (₹)', key: 'paid', width: 16 },
        { header: 'Due (₹)', key: 'due', width: 16 }
      ];
      styleHeader();

      const report = await getInvoiceReport(tenantId, { ...query, page: '1', limit: '10000' });
      for (const row of report.data) {
        worksheet
          .addRow({
            invoiceNo: row.invoiceNo,
            client: row.client?.name || 'N/A',
            date: row.date ? new Date(row.date).toLocaleDateString() : 'N/A',
            dueDate: row.dueDate ? new Date(row.dueDate).toLocaleDateString() : 'N/A',
            status: row.status,
            subtotal: row.totals?.subtotal || 0,
            discount: row.totals?.totalDiscount || 0,
            taxable: row.totals?.totalTaxable || 0,
            tax: row.totals?.totalGst || 0,
            paid: row.totals?.amountPaid || 0,
            due: row.totals?.amountDue || 0
          })
          .commit();
      }
      break;
    }

    case 'receipts': {
      worksheet.columns = [
        { header: 'Receipt No', key: 'receiptNo', width: 18 },
        { header: 'Client', key: 'client', width: 25 },
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Payment Mode', key: 'mode', width: 16 },
        { header: 'Ref No', key: 'ref', width: 18 },
        { header: 'Total Collected (₹)', key: 'total', width: 18 },
        { header: 'TDS (₹)', key: 'tds', width: 14 },
        { header: 'Discount (₹)', key: 'discount', width: 14 }
      ];
      styleHeader();

      const report = await getReceiptReport(tenantId, { ...query, page: '1', limit: '10000' });
      for (const row of report.data) {
        worksheet
          .addRow({
            receiptNo: row.receiptNo,
            client: row.client?.name || 'N/A',
            date: row.date ? new Date(row.date).toLocaleDateString() : 'N/A',
            mode: row.paymentMode,
            ref: row.referenceNumber || 'N/A',
            total: row.totalAmount,
            tds: row.tdsAmount || 0,
            discount: row.discountAmount || 0
          })
          .commit();
      }
      break;
    }

    case 'gst-summary': {
      worksheet.columns = [
        { header: 'Invoice No', key: 'invoiceNo', width: 18 },
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Client Name', key: 'client', width: 25 },
        { header: 'GSTIN', key: 'gstin', width: 18 },
        { header: 'State', key: 'state', width: 16 },
        { header: 'SAC Code', key: 'sac', width: 14 },
        { header: 'Particulars', key: 'particulars', width: 25 },
        { header: 'Taxable (₹)', key: 'taxable', width: 16 },
        { header: 'GST Rate (%)', key: 'rate', width: 14 },
        { header: 'CGST (₹)', key: 'cgst', width: 14 },
        { header: 'SGST (₹)', key: 'sgst', width: 14 },
        { header: 'IGST (₹)', key: 'igst', width: 14 },
        { header: 'Total (₹)', key: 'total', width: 16 }
      ];
      styleHeader();

      const report = await getGstSummaryReport(tenantId, { ...query, page: '1', limit: '10000' });
      for (const row of report.data) {
        worksheet
          .addRow({
            invoiceNo: row.invoiceNo,
            date: row.invoiceDate ? new Date(row.invoiceDate).toLocaleDateString() : 'N/A',
            client: row.clientName || 'N/A',
            gstin: row.clientGstin || 'URP / Unregistered',
            state: row.clientState || 'N/A',
            sac: row.sacCode || 'N/A',
            particulars: row.particulars,
            taxable: row.taxableAmount,
            rate: row.gstRate,
            cgst: row.cgstAmount,
            sgst: row.sgstAmount,
            igst: row.igstAmount,
            total: row.totalAmount
          })
          .commit();
      }
      break;
    }

    case 'debtors-aging': {
      worksheet.columns = [
        { header: 'Client Name', key: 'client', width: 28 },
        { header: 'PAN', key: 'pan', width: 16 },
        { header: 'Mobile', key: 'mobile', width: 16 },
        { header: 'Total Due (₹)', key: 'total', width: 18 },
        { header: '0–30 Days (₹)', key: 'c0_30', width: 16 },
        { header: '31–60 Days (₹)', key: 'c31_60', width: 16 },
        { header: '61–90 Days (₹)', key: 'c61_90', width: 16 },
        { header: '90+ Days (₹)', key: 'c90Plus', width: 16 },
        { header: 'Invoices Count', key: 'count', width: 16 },
        { header: 'Oldest Due Date', key: 'oldestDue', width: 16 }
      ];
      styleHeader();

      const report = await getDebtorsAgingReport(tenantId, { ...query, page: '1', limit: '10000' });
      for (const row of report.data) {
        worksheet
          .addRow({
            client: row.clientName || 'N/A',
            pan: row.pan || 'N/A',
            mobile: row.mobile || 'N/A',
            total: row.totalDue,
            c0_30: row.bucket0_30,
            c31_60: row.bucket31_60,
            c61_90: row.bucket61_90,
            c90Plus: row.bucket90Plus,
            count: row.invoicesCount,
            oldestDue: row.oldestDueDate ? new Date(row.oldestDueDate).toLocaleDateString() : 'N/A'
          })
          .commit();
      }
      break;
    }

    default:
      throw new ApiError(400, `Unknown report type: ${reportType}`, 'INVALID_REPORT_TYPE');
  }

  await worksheet.commit();
  await workbook.commit();
};
