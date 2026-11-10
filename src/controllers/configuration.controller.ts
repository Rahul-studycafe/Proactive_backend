import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import { TenantConfigurationService } from '../services/tenant-configuration.service';
import { z } from 'zod';

const createOptionSchema = z.object({
  categoryKey: z.string().min(1, 'Category key is required'),
  label: z.string().min(1, 'Label is required'),
  value: z.string().optional(),
  color: z.string().nullable().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const updateOptionSchema = z.object({
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

const reorderSchema = z.object({
  categoryKey: z.string().min(1),
  orderedIds: z.array(z.string()).min(1),
});

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, 'Tenant context missing', 'UNAUTHORIZED');
  }

  const categories = await TenantConfigurationService.getCategories(tenantId);
  return sendSuccess(res, 200, 'Categories retrieved', categories);
});

export const getOptions = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, 'Tenant context missing', 'UNAUTHORIZED');
  }

  const { categoryKey, includeInactive } = req.query;
  if (!categoryKey || typeof categoryKey !== 'string') {
    throw new ApiError(400, 'categoryKey query parameter is required', 'VALIDATION_FAILED');
  }

  const options = await TenantConfigurationService.getOptionsForCategory(
    tenantId,
    categoryKey,
    includeInactive === 'true'
  );

  return sendSuccess(res, 200, 'Configuration options retrieved', options);
});

export const createOption = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, 'Tenant context missing', 'UNAUTHORIZED');
  }

  const parsed = createOptionSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((e) => e.message).join(', ');
    throw new ApiError(400, errorMsg, 'VALIDATION_FAILED');
  }

  const { categoryKey, label, value, color, description, metadata } = parsed.data;

  const option = await TenantConfigurationService.addOption(
    tenantId,
    (req.user as any)?.userId,
    categoryKey,
    { label, value, color: color || undefined, description, metadata }
  );

  return sendSuccess(res, 201, 'Option created successfully', option);
});

export const updateOption = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, 'Tenant context missing', 'UNAUTHORIZED');
  }

  const id = req.params.id as string;
  const parsed = updateOptionSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((e) => e.message).join(', ');
    throw new ApiError(400, errorMsg, 'VALIDATION_FAILED');
  }

  const updated = await TenantConfigurationService.updateOption(
    tenantId,
    (req.user as any)?.userId,
    id,
    parsed.data
  );

  return sendSuccess(res, 200, 'Option updated successfully', updated);
});

export const toggleOptionStatus = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, 'Tenant context missing', 'UNAUTHORIZED');
  }

  const id = req.params.id as string;
  const updated = await TenantConfigurationService.toggleOptionStatus(tenantId, id);

  return sendSuccess(res, 200, `Option ${updated.isActive ? 'activated' : 'deactivated'} successfully`, updated);
});

export const deleteOption = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, 'Tenant context missing', 'UNAUTHORIZED');
  }

  const id = req.params.id as string;
  const result = await TenantConfigurationService.deleteOption(tenantId, id);

  return sendSuccess(res, 200, result.message, result);
});

export const reorderOptions = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new ApiError(401, 'Tenant context missing', 'UNAUTHORIZED');
  }

  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid reorder payload', 'VALIDATION_FAILED');
  }

  await TenantConfigurationService.reorderOptions(tenantId, parsed.data.categoryKey, parsed.data.orderedIds);

  return sendSuccess(res, 200, 'Options reordered successfully', null);
});
