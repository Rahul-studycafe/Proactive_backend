import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  createHolidayService,
  getHolidaysService,
  getHolidayByIdService,
  updateHolidayService,
  deleteHolidayService,
  seedDefaultHolidaysService
} from '../services/holiday.service';

const createHolidaySchema = z.object({
  name: z.string().trim().min(1, 'Holiday name is required'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  type: z.enum(['National', 'Festival', 'Optional', 'Other']).default('National'),
  description: z.string().trim().optional()
});

const updateHolidaySchema = z.object({
  name: z.string().trim().min(1, 'Holiday name cannot be empty').optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  type: z.enum(['National', 'Festival', 'Optional', 'Other']).optional(),
  description: z.string().trim().optional()
});

export const createHoliday = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const parsed = createHolidaySchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
    }

    const holiday = await createHolidayService(req.tenantId, parsed.data);
    return sendSuccess(res, 201, 'Holiday created successfully', holiday);
  }
);

export const getHolidays = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const holidays = await getHolidaysService(req.tenantId, {
      year: req.query.year as string,
      type: req.query.type as string,
      from: req.query.from as string,
      to: req.query.to as string
    });

    return sendSuccess(res, 200, 'Holidays retrieved successfully', holidays);
  }
);

export const getHolidayById = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const id = req.params.id as string;
    const holiday = await getHolidayByIdService(req.tenantId, id);
    return sendSuccess(res, 200, 'Holiday retrieved successfully', holiday);
  }
);

export const updateHoliday = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const parsed = updateHolidaySchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
    }

    const id = req.params.id as string;
    const updated = await updateHolidayService(
      req.tenantId,
      id,
      parsed.data
    );
    return sendSuccess(res, 200, 'Holiday updated successfully', updated);
  }
);

export const deleteHoliday = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const id = req.params.id as string;
    await deleteHolidayService(req.tenantId, id);
    return sendSuccess(res, 200, 'Holiday deleted successfully');
  }
);

export const seedDefaultHolidays = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const year = (req.query.year || req.body?.year) as string | undefined;
    const result = await seedDefaultHolidaysService(req.tenantId, year);
    return sendSuccess(res, 201, `Statutory holidays seeded for ${result.year}`, result);
  }
);
