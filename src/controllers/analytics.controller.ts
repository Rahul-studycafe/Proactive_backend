import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  getClientDistributionService,
  getStaffPerformanceLeaderboardService,
  getAttendanceOverviewService
} from '../services/analytics.service';

/**
 * Phase 67: Client Entity Distribution Aggregation
 */
export const getClientDistribution = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const distribution = await getClientDistributionService(
    req.tenantId as mongoose.Types.ObjectId
  );
  return sendSuccess(res, 200, 'Client entity distribution retrieved', distribution);
});

const staffPerformanceQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

/**
 * Phase 68: Best Performer & Staff Leaderboard
 */
export const getStaffPerformance = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const parsed = staffPerformanceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(', ');
    throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
  }

  const leaderboard = await getStaffPerformanceLeaderboardService(
    req.tenantId as mongoose.Types.ObjectId,
    parsed.data.from,
    parsed.data.to
  );
  return sendSuccess(res, 200, 'Staff performance leaderboard retrieved', leaderboard);
});

const attendanceOverviewQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  departmentId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid departmentId format')
    .optional()
});

/**
 * Phase 69: Attendance KPI Overview Aggregation
 */
export const getAttendanceOverview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const parsed = attendanceOverviewQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(', ');
    throw new ApiError(400, `Validation Error: ${issues}`, 'VALIDATION_FAILED');
  }

  const overview = await getAttendanceOverviewService(
    req.tenantId as mongoose.Types.ObjectId,
    parsed.data.date,
    parsed.data.departmentId
  );
  return sendSuccess(res, 200, 'Attendance KPI overview retrieved', overview);
});
