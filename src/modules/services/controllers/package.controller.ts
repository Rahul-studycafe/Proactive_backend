import { Request, Response } from 'express';
import { Package } from '../schemas/package.schema';
import { sendSuccess } from '../../../common/responses/api-response';
import { asyncHandler } from '../../../utils/async-handler';
import { ApiError } from '../../../common/errors/api-error';
import { z } from 'zod';

const createPackageSchema = z.object({
  name: z.string().min(1),
  frequency: z.enum(['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time']),
  defaultBillingAmount: z.number().min(0),
  sacCode: z.string().optional(),
  gstPercentage: z.number().min(0),
  serviceIds: z.array(z.string()).min(1),
  isActive: z.boolean().optional()
});

const updatePackageSchema = createPackageSchema.partial();

export const createPackage = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createPackageSchema.parse(req.body);
  
  const pkg = await Package.create({
    ...validatedData,
    tenantId: req.user!.tenantId
  });

  return sendSuccess(res, 201, 'Package created successfully', pkg);
});

export const getPackages = asyncHandler(async (req: Request, res: Response) => {
  const packages = await Package.find({ tenantId: req.user!.tenantId })
    .populate('serviceIds', 'name isEnabled')
    .sort({ createdAt: -1 });

  return sendSuccess(res, 200, 'Packages retrieved successfully', packages);
});

export const getPackageById = asyncHandler(async (req: Request, res: Response) => {
  const pkg = await Package.findOne({ 
    _id: req.params.id, 
    tenantId: req.user!.tenantId 
  }).populate('serviceIds', 'name isEnabled');

  if (!pkg) {
    throw new ApiError(404, 'Package not found');
  }

  return sendSuccess(res, 200, 'Package retrieved successfully', pkg);
});

export const updatePackage = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = updatePackageSchema.parse(req.body);
  
  const pkg = await Package.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user!.tenantId },
    { $set: validatedData },
    { new: true, runValidators: true }
  ).populate('serviceIds', 'name isEnabled');

  if (!pkg) {
    throw new ApiError(404, 'Package not found');
  }

  return sendSuccess(res, 200, 'Package updated successfully', pkg);
});

export const deletePackage = asyncHandler(async (req: Request, res: Response) => {
  const pkg = await Package.findOneAndDelete({ 
    _id: req.params.id, 
    tenantId: req.user!.tenantId 
  });

  if (!pkg) {
    throw new ApiError(404, 'Package not found');
  }

  return sendSuccess(res, 200, 'Package deleted successfully');
});
