import mongoose, { Types } from 'mongoose';
import { NotificationTemplate, INotificationTemplate, NotificationChannel } from '../models/NotificationTemplate';
import { NotificationLog } from '../models/NotificationLog';
import { Client } from '../modules/clients/schemas/client.schema';
import { ApiError } from '../common/errors/api-error';

export interface AudienceFilters {
  hasUnpaidInvoices?: boolean;
  minOutstandingAmount?: number;
  subscribedServiceId?: string;
  clientTags?: string[];
  clientGroups?: string[];
  hasActiveTasks?: boolean;
}

export interface AudienceRecipient {
  clientId: string;
  clientName: string;
  email?: string;
  mobile?: string;
  outstandingBalance: number;
  activeTasksCount: number;
  variables: Record<string, any>;
}

/**
 * Phase 116: Interpolate dynamic placeholders like {{clientName}}, {{outstandingBalance}}
 */
export const interpolateVariables = (
  templateText: string,
  variables: Record<string, any>
): string => {
  return templateText.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return variables[key] !== undefined && variables[key] !== null
      ? String(variables[key])
      : '';
  });
};

/**
 * Phase 116: Audience Query Builder
 * Queries clients based on operational criteria and computes dynamic placeholder variables
 */
export const getAudienceRecipients = async (
  tenantId: Types.ObjectId,
  filters: AudienceFilters = {}
): Promise<AudienceRecipient[]> => {
  const clientMatch: Record<string, any> = {
    tenantId: new Types.ObjectId(tenantId),
    isActive: true
  };

  if (filters.clientTags && filters.clientTags.length > 0) {
    clientMatch.tags = { $in: filters.clientTags };
  }
  if (filters.clientGroups && filters.clientGroups.length > 0) {
    clientMatch.groupId = {
      $in: filters.clientGroups.map((id) => new Types.ObjectId(id))
    };
  }
  if (
    filters.subscribedServiceId &&
    Types.ObjectId.isValid(filters.subscribedServiceId)
  ) {
    clientMatch['subscribedServices.serviceId'] = new Types.ObjectId(
      filters.subscribedServiceId
    );
  }

  const pipeline: any[] = [
    { $match: clientMatch },
    {
      $lookup: {
        from: 'invoices',
        let: { cId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$clientId', '$$cId'] },
                  { $in: ['$status', ['Unpaid', 'Partially Paid']] }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              totalDue: { $sum: '$totals.amountDue' }
            }
          }
        ],
        as: 'invoiceData'
      }
    },
    {
      $lookup: {
        from: 'tasks',
        let: { cId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$clientId', '$$cId'] },
                  { $not: { $in: ['$status', ['Completed', 'Cancelled']] } }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              activeCount: { $sum: 1 },
              latestTaskName: { $first: '$description' },
              latestDueDate: { $first: '$dueDate' }
            }
          }
        ],
        as: 'taskData'
      }
    },
    {
      $addFields: {
        outstandingBalance: {
          $ifNull: [{ $arrayElemAt: ['$invoiceData.totalDue', 0] }, 0]
        },
        activeTasksCount: {
          $ifNull: [{ $arrayElemAt: ['$taskData.activeCount', 0] }, 0]
        },
        latestTaskName: {
          $ifNull: [
            { $arrayElemAt: ['$taskData.latestTaskName', 0] },
            'Statutory Compliance'
          ]
        },
        latestDueDate: {
          $arrayElemAt: ['$taskData.latestDueDate', 0]
        }
      }
    }
  ];

  if (filters.hasUnpaidInvoices === true) {
    pipeline.push({ $match: { outstandingBalance: { $gt: 0 } } });
  }
  if (filters.minOutstandingAmount && filters.minOutstandingAmount > 0) {
    pipeline.push({
      $match: { outstandingBalance: { $gte: filters.minOutstandingAmount } }
    });
  }
  if (filters.hasActiveTasks === true) {
    pipeline.push({ $match: { activeTasksCount: { $gt: 0 } } });
  }

  pipeline.push({
    $project: {
      _id: 1,
      name: 1,
      email: 1,
      mobile: 1,
      outstandingBalance: 1,
      activeTasksCount: 1,
      latestTaskName: 1,
      latestDueDate: 1
    }
  });

  const clients = await Client.aggregate(pipeline);

  return clients.map((c) => ({
    clientId: c._id.toString(),
    clientName: c.name,
    email: c.email || '',
    mobile: c.mobile || '',
    outstandingBalance: c.outstandingBalance,
    activeTasksCount: c.activeTasksCount,
    variables: {
      clientName: c.name,
      outstandingBalance: `₹${c.outstandingBalance}`,
      taskName: c.latestTaskName,
      dueDate: c.latestDueDate
        ? new Date(c.latestDueDate).toLocaleDateString()
        : 'Immediately'
    }
  }));
};

/**
 * Phase 116: Template Master CRUD
 */
export const createNotificationTemplate = async (
  tenantId: Types.ObjectId,
  data: Partial<INotificationTemplate>
) => {
  return NotificationTemplate.create({
    ...data,
    tenantId: new Types.ObjectId(tenantId)
  });
};

export const getNotificationTemplates = async (
  tenantId: Types.ObjectId,
  channel?: NotificationChannel
) => {
  const filter: Record<string, any> = { tenantId: new Types.ObjectId(tenantId) };
  if (channel) filter.channel = channel;
  return NotificationTemplate.find(filter).sort({ createdAt: -1 });
};

export const getNotificationTemplateById = async (
  tenantId: Types.ObjectId,
  id: string
) => {
  const template = await NotificationTemplate.findOne({
    _id: new Types.ObjectId(id),
    tenantId: new Types.ObjectId(tenantId)
  });
  if (!template) {
    throw new ApiError(404, 'Notification template not found', 'NOT_FOUND');
  }
  return template;
};

export const updateNotificationTemplate = async (
  tenantId: Types.ObjectId,
  id: string,
  data: Partial<INotificationTemplate>
) => {
  const template = await NotificationTemplate.findOneAndUpdate(
    { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
    { $set: data },
    { new: true, runValidators: true }
  );
  if (!template) {
    throw new ApiError(404, 'Notification template not found', 'NOT_FOUND');
  }
  return template;
};

export const deleteNotificationTemplate = async (
  tenantId: Types.ObjectId,
  id: string
) => {
  const template = await NotificationTemplate.findOneAndDelete({
    _id: new Types.ObjectId(id),
    tenantId: new Types.ObjectId(tenantId)
  });
  if (!template) {
    throw new ApiError(404, 'Notification template not found', 'NOT_FOUND');
  }
  return { deleted: true };
};

/**
 * Phase 117: Process Bulk Notifications Core
 */
export interface BulkNotificationJobPayload {
  tenantId: string;
  templateId?: string;
  recipientIds: string[];
  channel: NotificationChannel;
  customMessage?: string;
  subject?: string;
}

export const processBulkNotifications = async (
  payload: BulkNotificationJobPayload
) => {
  const { tenantId, templateId, recipientIds, channel, customMessage, subject } = payload;
  const tenantObjId = new Types.ObjectId(tenantId);

  let templateBody = customMessage || '';
  let templateSubject = subject || '';

  if (templateId && Types.ObjectId.isValid(templateId)) {
    const template = await NotificationTemplate.findOne({
      _id: new Types.ObjectId(templateId),
      tenantId: tenantObjId
    });
    if (template) {
      templateBody = customMessage || template.body;
      templateSubject = subject || template.subject || '';
    }
  }

  // Fetch recipients
  const audience = await getAudienceRecipients(tenantObjId);
  const audienceMap = new Map<string, AudienceRecipient>();
  audience.forEach((a) => audienceMap.set(a.clientId, a));

  const logsToInsert: any[] = [];

  for (const clientId of recipientIds) {
    const recipient = audienceMap.get(clientId);
    if (!recipient) continue;

    const interpolatedBody = interpolateVariables(templateBody, recipient.variables);
    const interpolatedSubject = interpolateVariables(templateSubject, recipient.variables);

    const destination =
      channel === 'Email' ? recipient.email : recipient.mobile;

    logsToInsert.push({
      tenantId: tenantObjId,
      templateId: templateId ? new Types.ObjectId(templateId) : undefined,
      clientId: new Types.ObjectId(clientId),
      channel,
      recipient: destination || 'N/A',
      subject: interpolatedSubject,
      content: interpolatedBody,
      status: destination ? 'Sent' : 'Failed',
      error: destination ? undefined : 'Missing recipient contact info',
      sentAt: new Date()
    });
  }

  if (logsToInsert.length > 0) {
    await NotificationLog.insertMany(logsToInsert);
  }

  return {
    totalRecipients: recipientIds.length,
    dispatchedCount: logsToInsert.filter((l) => l.status === 'Sent').length,
    failedCount: logsToInsert.filter((l) => l.status === 'Failed').length
  };
};
