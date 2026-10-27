import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  getWorkingDaysService,
  updateWorkingDaysService
} from '../services/tenant-settings.service';

const canonicalDayMap: Record<string, 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'> = {
  mon: 'Monday', monday: 'Monday',
  tue: 'Tuesday', tuesday: 'Tuesday',
  wed: 'Wednesday', wednesday: 'Wednesday',
  thu: 'Thursday', thursday: 'Thursday',
  fri: 'Friday', friday: 'Friday',
  sat: 'Saturday', saturday: 'Saturday',
  sun: 'Sunday', sunday: 'Sunday'
};

const weekendDaySchema = z.string().transform((val, ctx) => {
  const key = val.trim().toLowerCase();
  const normalized = canonicalDayMap[key];
  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid day name '${val}'. Must be a valid weekday name.`
    });
    return z.NEVER;
  }
  return normalized;
});

const updateWorkingDaysSchema = z.object({
  weekends: z
    .array(weekendDaySchema)
    .min(1, 'At least one weekend day must be specified')
    .optional(),
  standardWorkHoursPerDay: z
    .number()
    .positive('Working hours must be positive')
    .max(24, 'Working hours cannot exceed 24')
    .optional(),
  alternateWeekendRules: z
    .object({
      day: weekendDaySchema.default('Saturday'),
      weeks: z.array(z.number().min(1).max(5)).default([])
    })
    .optional(),
  officePerimeter: z
    .object({
      enableIpWhitelist: z.boolean().optional(),
      ipWhitelist: z.array(z.string()).optional(),
      enforceGeofence: z.boolean().optional(),
      latitude: z.number().optional().nullable(),
      longitude: z.number().optional().nullable(),
      geofenceRadiusMeters: z.number().positive().optional()
    })
    .optional()
});

export const getMyIp = asyncHandler(async (req: Request, res: Response) => {
  const rawIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    '127.0.0.1';
  let clientIp = rawIp;
  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.substring(7);
  }
  return sendSuccess(res, 200, 'Client IP detected', { ip: rawIp, normalizedIp: clientIp });
});

export const getWorkingDays = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const config = await getWorkingDaysService(req.tenantId);
    return sendSuccess(res, 200, 'Working days configuration retrieved', config);
  }
);

export const updateWorkingDays = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const parsed = updateWorkingDaysSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
    }

    const config = await updateWorkingDaysService(req.tenantId, parsed.data);
    return sendSuccess(
      res,
      200,
      'Working days configuration updated successfully',
      config
    );
  }
);

export const getBillingEntities = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const { BillingEntity } = await import('../modules/masters/schemas');
  const entities = await BillingEntity.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
  return sendSuccess(res, 200, 'Billing entities retrieved', entities);
});

export const createBillingEntity = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const { BillingEntity } = await import('../modules/masters/schemas');
  const entity = await BillingEntity.create({
    tenantId: req.tenantId,
    ...req.body
  });
  return sendSuccess(res, 201, 'Billing entity created successfully', entity);
});
