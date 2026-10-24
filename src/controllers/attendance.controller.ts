import { Request, Response } from 'express';
import { Readable } from 'stream';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  checkInService,
  checkOutService,
  getTodayAttendanceService,
  getDailyRosterService,
  markAttendanceService,
  bulkMarkAttendanceService,
  getMonthlyMatrixService,
  getStaffAttendanceSummaryService,
  exportMonthlyAttendanceService
} from '../services/attendance.service';

const checkInSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  timestamp: z.string().optional(),
  notes: z.string().trim().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  clientIp: z.string().optional()
});

const checkOutSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  timestamp: z.string().optional(),
  notes: z.string().trim().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  clientIp: z.string().optional()
});

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId || !req.user?._id) {
    throw new ApiError(403, 'Tenant or user context missing', 'FORBIDDEN');
  }

  const parsed = checkInSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(', ');
    throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
  }

  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket?.remoteAddress || req.ip || '127.0.0.1';

  const clientIp = parsed.data.clientIp || rawIp;

  const attendance = await checkInService(
    req.tenantId,
    req.user._id,
    {
      ...parsed.data,
      clientIp
    }
  );
  return sendSuccess(res, 201, 'Checked in successfully', attendance);
});

export const checkOut = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId || !req.user?._id) {
    throw new ApiError(403, 'Tenant or user context missing', 'FORBIDDEN');
  }

  const parsed = checkOutSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(', ');
    throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
  }

  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket?.remoteAddress || req.ip || '127.0.0.1';

  const clientIp = parsed.data.clientIp || rawIp;

  const attendance = await checkOutService(
    req.tenantId,
    req.user._id,
    {
      ...parsed.data,
      clientIp
    }
  );
  return sendSuccess(res, 200, 'Checked out successfully', attendance);
});

export const getTodayAttendance = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId || !req.user?._id) {
      throw new ApiError(403, 'Tenant or user context missing', 'FORBIDDEN');
    }

    const attendance = await getTodayAttendanceService(
      req.tenantId,
      req.user._id,
      req.query.date as string
    );
    return sendSuccess(res, 200, 'Today attendance status', attendance);
  }
);

export const getDailyRoster = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const dateParam = req.query.date as string | undefined;
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      throw new ApiError(
        400,
        'Date must be in YYYY-MM-DD format',
        'INVALID_DATE_FORMAT'
      );
    }

    const result = await getDailyRosterService(req.tenantId, dateParam);
    return sendSuccess(res, 200, 'Daily attendance roster retrieved', result);
  }
);

const markAttendanceSchema = z.object({
  userId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid userId format'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  status: z.enum([
    'Present',
    'Absent',
    'Half Day',
    'Leave',
    'Paid Leave',
    'Holiday'
  ]),
  checkIn: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid checkIn ISO date string'
    })
    .optional()
    .nullable(),
  checkOut: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid checkOut ISO date string'
    })
    .optional()
    .nullable(),
  notes: z.string().trim().optional().nullable()
});

export const markAttendance = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId || !req.user?._id) {
    throw new ApiError(403, 'Tenant or user context missing', 'FORBIDDEN');
  }

  const parsed = markAttendanceSchema.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(', ');
    throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
  }

  const attendance = await markAttendanceService(
    req.tenantId,
    req.user._id,
    parsed.data as any
  );

  return sendSuccess(res, 200, 'Attendance marked successfully', attendance);
});

const bulkMarkAttendanceSchema = z.object({
  userIds: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid userId format'))
    .min(1, 'At least one userId is required')
    .max(250, 'Batch size cannot exceed 250 employees'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  status: z.enum([
    'Present',
    'Absent',
    'Half Day',
    'Leave',
    'Paid Leave',
    'Holiday'
  ]),
  notes: z.string().trim().optional().nullable()
});

export const bulkMarkAttendance = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId || !req.user?._id) {
      throw new ApiError(403, 'Tenant or user context missing', 'FORBIDDEN');
    }

    const parsed = bulkMarkAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
    }

    const result = await bulkMarkAttendanceService(
      req.tenantId,
      req.user._id,
      parsed.data as any
    );

    return sendSuccess(res, 200, 'Bulk attendance applied successfully', result);
  }
);

const monthlyMatrixQuerySchema = z.object({
  month: z
    .string()
    .regex(/^(0?[1-9]|1[0-2])$/, 'Month must be between 1 and 12')
    .optional(),
  year: z
    .string()
    .regex(/^\d{4}$/, 'Year must be a 4-digit number (YYYY)')
    .optional(),
  departmentId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid departmentId format')
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional()
});

export const getMonthlyMatrix = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const parsed = monthlyMatrixQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
    }

    const result = await getMonthlyMatrixService(
      req.tenantId,
      parsed.data.month,
      parsed.data.year,
      parsed.data.departmentId,
      parsed.data.page,
      parsed.data.limit
    );

    return sendSuccess(res, 200, 'Monthly attendance matrix retrieved', result);
  }
);

const staffSummaryParamSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid userId format')
});

export const getStaffAttendanceSummary = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const paramParsed = staffSummaryParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      const issues = paramParsed.error.issues.map((i) => i.message).join(', ');
      throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
    }

    const queryParsed = monthlyMatrixQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      const issues = queryParsed.error.issues.map((i) => i.message).join(', ');
      throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
    }

    const summary = await getStaffAttendanceSummaryService(
      req.tenantId,
      paramParsed.data.userId,
      queryParsed.data.month,
      queryParsed.data.year
    );

    return sendSuccess(res, 200, 'Staff attendance summary retrieved', summary);
  }
);

export const exportMonthlyAttendance = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.tenantId) {
      throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
    }

    const queryParsed = monthlyMatrixQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      const issues = queryParsed.error.issues.map((i) => i.message).join(', ');
      throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
    }

    const { filename, csv } = await exportMonthlyAttendanceService(
      req.tenantId,
      queryParsed.data.month,
      queryParsed.data.year
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = Readable.from([csv]);
    return stream.pipe(res);
  }
);




