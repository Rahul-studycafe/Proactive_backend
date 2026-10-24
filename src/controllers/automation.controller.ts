import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import { scanAndGenerateRecurringTasks } from '../services/task-generation.service';
import { AutomationLog } from '../models/AutomationLog';

const triggerTasksSchema = z.object({
  clientId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid clientId format')
    .optional(),
  serviceId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid serviceId format')
    .optional()
});

/**
 * Manual & On-Demand Automation Trigger API (Phase 65)
 */
export const triggerTasks = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const parsed = triggerTasksSchema.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(', ');
    throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
  }

  const result = await scanAndGenerateRecurringTasks({
    tenantId: req.tenantId,
    clientId: parsed.data.clientId
      ? new mongoose.Types.ObjectId(parsed.data.clientId)
      : undefined,
    serviceId: parsed.data.serviceId
      ? new mongoose.Types.ObjectId(parsed.data.serviceId)
      : undefined,
    forceAll: true, // Manual trigger executes on-demand
    runType: 'Manual',
    triggeredBy: req.user?._id
  });

  return sendSuccess(res, 200, 'Automated task generation executed successfully', {
    scannedClients: result.scannedClients,
    tasksCreated: result.tasksCreated,
    tasksSkipped: result.tasksSkipped,
    errors: result.errors,
    details: result.details,
    logId: result.logId
  });
});

const getLogsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional()
});

/**
 * Automation Audit Log & History API (Phase 66)
 */
export const getAutomationLogs = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const parsed = getLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(', ');
    throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
  }

  const page = Math.max(parseInt(parsed.data.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(parsed.data.limit || '20', 10), 1), 100);
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    AutomationLog.find({ tenantId: req.tenantId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('triggeredBy', 'name username email')
      .populate('details.clientId', 'name fileNo')
      .populate('details.serviceId', 'name'),
    AutomationLog.countDocuments({ tenantId: req.tenantId })
  ]);

  return sendSuccess(res, 200, 'Automation audit logs retrieved successfully', {
    logs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  });
});
