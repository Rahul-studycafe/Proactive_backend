import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  verifyPanService,
  verifyGstinService,
  autoFillClientFromGstinService,
  getComplianceLogsService
} from '../services/compliance-verification.service';

const verifyPanSchema = z.object({
  pan: z.string().min(10, 'PAN must be exactly 10 characters').max(10, 'PAN must be exactly 10 characters'),
  clientId: z.string().optional()
});

const verifyGstinSchema = z.object({
  gstin: z.string().min(15, 'GSTIN must be exactly 15 characters').max(15, 'GSTIN must be exactly 15 characters'),
  clientId: z.string().optional()
});

const autoFillSchema = z.object({
  gstin: z.string().min(15, 'GSTIN must be 15 characters').max(15, 'GSTIN must be 15 characters')
});

/**
 * Validates Indian PAN syntax, queries verification adapter / 30-day cache, and returns entity classification
 */
export const verifyPan = asyncHandler(async (req: Request, res: Response) => {
  const parsed = verifyPanSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const result = await verifyPanService(
    req.tenantId!,
    parsed.data.pan,
    req.user!._id,
    parsed.data.clientId
  );

  return sendSuccess(res, 200, 'PAN verification completed successfully', result);
});

/**
 * Validates 15-character GSTIN, validates state prefix, queries adapter / cache, and returns taxpayer profile
 */
export const verifyGstin = asyncHandler(async (req: Request, res: Response) => {
  const parsed = verifyGstinSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const result = await verifyGstinService(
    req.tenantId!,
    parsed.data.gstin,
    req.user!._id,
    parsed.data.clientId
  );

  return sendSuccess(res, 200, 'GSTIN verification completed successfully', result);
});

/**
 * 1-Click Client Onboarding Auto-Fill: transforms verified GSTIN into structured client creation data
 */
export const autoFillClientFromGstin = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = autoFillSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
    }

    const result = await autoFillClientFromGstinService(
      req.tenantId!,
      parsed.data.gstin,
      req.user!._id
    );

    return sendSuccess(
      res,
      200,
      'Client onboarding form auto-filled successfully from GSTIN',
      result
    );
  }
);

/**
 * Compliance audit trail: lists past verifications and quota cache records
 */
export const getComplianceLogs = asyncHandler(async (req: Request, res: Response) => {
  const result = await getComplianceLogsService(req.tenantId!, req.query as any);
  return sendSuccess(res, 200, 'Compliance verification audit logs retrieved', result);
});
