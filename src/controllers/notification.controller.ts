import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  createNotificationTemplate,
  getNotificationTemplates,
  getNotificationTemplateById,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  getAudienceRecipients
} from '../services/notification.service';
import { dispatchBulkNotificationJob } from '../queues/bulk-notification.queue';

const createTemplateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  channel: z.enum(['Email', 'SMS', 'WhatsApp']),
  subject: z.string().optional(),
  body: z.string().min(1, 'Template body is required'),
  isActive: z.boolean().optional()
});

export const createTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const parsed = createTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(', ');
    throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
  }

  const template = await createNotificationTemplate(
    req.tenantId as Types.ObjectId,
    parsed.data
  );
  return sendSuccess(res, 201, 'Notification template created successfully', template);
});

export const getTemplatesHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const channel = req.query.channel as any;
  const templates = await getNotificationTemplates(
    req.tenantId as Types.ObjectId,
    channel
  );
  return sendSuccess(res, 200, 'Notification templates retrieved', templates);
});

export const getTemplateByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const template = await getNotificationTemplateById(
    req.tenantId as Types.ObjectId,
    req.params.id as string
  );
  return sendSuccess(res, 200, 'Notification template retrieved', template);
});

export const updateTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const template = await updateNotificationTemplate(
    req.tenantId as Types.ObjectId,
    req.params.id as string,
    req.body
  );
  return sendSuccess(res, 200, 'Notification template updated', template);
});

export const deleteTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const result = await deleteNotificationTemplate(
    req.tenantId as Types.ObjectId,
    req.params.id as string
  );
  return sendSuccess(res, 200, 'Notification template deleted', result);
});

/**
 * Phase 116: Audience Query Builder Endpoint
 */
export const queryAudienceHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const recipients = await getAudienceRecipients(
    req.tenantId as Types.ObjectId,
    req.body
  );
  return sendSuccess(res, 200, 'Audience recipients queried successfully', {
    totalRecipients: recipients.length,
    recipients
  });
});

const sendBulkSchema = z.object({
  templateId: z.string().optional(),
  recipientIds: z.array(z.string()).min(1, 'At least one recipient ID is required'),
  channel: z.enum(['Email', 'SMS', 'WhatsApp']),
  customMessage: z.string().optional(),
  subject: z.string().optional()
});

/**
 * Phase 117: Asynchronous Bulk Communications Dispatch Endpoint
 */
export const sendBulkNotificationHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const parsed = sendBulkSchema.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(', ');
    throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
  }

  const result = await dispatchBulkNotificationJob({
    tenantId: (req.tenantId as Types.ObjectId).toString(),
    ...parsed.data
  });

  return res.status(202).json({
    success: true,
    message: 'Bulk notifications queued successfully',
    data: result
  });
});
