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

export const updateBillingEntity = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const { BillingEntity } = await import('../modules/masters/schemas');
  const entity = await BillingEntity.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { $set: req.body },
    { new: true, runValidators: true }
  );

  if (!entity) {
    throw new ApiError(404, 'Billing entity not found');
  }

  return sendSuccess(res, 200, 'Billing entity updated successfully', entity);
});

export const uploadBillingEntityLogo = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No logo uploaded', 'FILE_REQUIRED');
  }
  const logoUrl = `/public/uploads/logos/${req.file.filename}`;
  return sendSuccess(res, 200, 'Logo uploaded successfully', { logoUrl });
});

export const deleteBillingEntity = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const { BillingEntity } = await import('../modules/masters/schemas');
  const entity = await BillingEntity.findOne({ _id: req.params.id, tenantId: req.tenantId });

  if (!entity) {
    throw new ApiError(404, 'Billing entity not found');
  }

  if (entity.isDefault) {
    throw new ApiError(
      400,
      'Cannot delete the default billing entity. Please designate another entity as default first.',
      'DEFAULT_ENTITY_IMMUTABLE'
    );
  }

  const { Invoice } = await import('../models/Invoice');
  const { Receipt } = await import('../models/Receipt');

  const [invoiceCount, receiptCount] = await Promise.all([
    Invoice.countDocuments({ tenantId: req.tenantId, billingEntityId: entity._id }),
    Receipt.countDocuments({ tenantId: req.tenantId, billingEntityId: entity._id })
  ]);

  if (invoiceCount > 0 || receiptCount > 0) {
    throw new ApiError(
      400,
      `Cannot delete billing entity '${entity.name}': It is linked to ${invoiceCount} invoice(s) and ${receiptCount} receipt(s). Disable the entity instead to preserve tax and accounting records.`,
      'BILLING_ENTITY_HAS_TAX_HISTORY'
    );
  }

  await BillingEntity.deleteOne({ _id: entity._id, tenantId: req.tenantId });

  return sendSuccess(res, 200, 'Billing entity deleted successfully', { id: req.params.id });
});

// ─── Phase 144 & 145: SaaS Subscription & Usage ──────────────────
export const getTenantUsage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const { TenantRenewalService } = await import('../services/tenant-renewal.service');
  const usage = await TenantRenewalService.getTenantUsage(req.tenantId as any);
  return sendSuccess(res, 200, 'Tenant usage metrics retrieved successfully', usage);
});

export const getTenantSubscription = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const { TenantSubscription } = await import('../models/TenantSubscription');
  const subscription = await TenantSubscription.findOne({ tenantId: req.tenantId });
  return sendSuccess(res, 200, 'Tenant subscription retrieved successfully', subscription);
});

export const upsertTenantSubscription = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const { TenantSubscription } = await import('../models/TenantSubscription');
  const subscription = await TenantSubscription.findOneAndUpdate(
    { tenantId: req.tenantId },
    { $set: { ...req.body, tenantId: req.tenantId } },
    { new: true, upsert: true, runValidators: true }
  );

  return sendSuccess(res, 200, 'Tenant subscription updated successfully', subscription);
});
