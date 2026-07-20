import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/async-handler';
import { sendSuccess } from '../../../common/responses/api-response';
import { ApiError } from '../../../common/errors/api-error';
import { Service } from '../schemas';
import { Client } from '../../clients/schemas/client.schema';
import { z } from 'zod';

const serviceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  isEnabled: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  frequency: z.object({
    type: z.enum(['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time']),
    creationDay: z.number().min(1).max(31).optional(),
    dueDay: z.number().min(1).max(31).optional(),
    creationMonthOffset: z.string().optional(),
    dueMonthOffset: z.string().optional(),
    creationDate: z.string().optional(),
    dueDate: z.string().optional()
  }).optional(),
  assignedUsers: z.array(z.string()).optional(),
  sacCode: z.string().optional(),
  gstPercentage: z.number().optional(),
  defaultBillingRate: z.number().optional(),
  isBillable: z.boolean().optional(),
  checklist: z.array(z.object({
    stepName: z.string().min(1),
    orderIndex: z.number()
  })).optional(),
  isWorkflowEnabled: z.boolean().optional(),
  subtasks: z.array(z.object({
    _id: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    relativeDueDays: z.number().optional(),
    relativeTargetDays: z.number().optional(),
    assignedUserIds: z.array(z.string()).optional()
  })).optional(),
  customFieldsDef: z.array(z.object({
    _id: z.string().optional(),
    label: z.string().min(1),
    fieldType: z.enum(['text', 'number', 'select', 'date']),
    options: z.array(z.string()).optional(),
    isRequired: z.boolean().optional()
  })).optional(),
  isChecklistRequired: z.boolean().optional(),
  gstApiConfig: z.object({
    isEnabled: z.boolean().optional(),
    returnType: z.string().optional()
  }).optional(),
  autoDocCollection: z.object({
    isEnabled: z.boolean().optional(),
    defaultMessage: z.string().optional()
  }).optional()
});

export const getServices = asyncHandler(async (req: Request, res: Response) => {
  const isEnabled = req.query.isEnabled as string;
  let query: any = { tenantId: req.tenantId };
  if (isEnabled !== undefined) {
    query.isEnabled = isEnabled === 'true';
  }

  const services = await Service.find(query).sort({ name: 1 }).populate('assignedUsers', 'name photoUrl').lean();

  const clientCounts = await Client.aggregate([
    { $match: { tenantId: req.tenantId, isActive: true } },
    { $unwind: '$subscribedServices' },
    { $group: { _id: '$subscribedServices.serviceId', count: { $sum: 1 } } }
  ]);

  const countMap = new Map();
  clientCounts.forEach(c => countMap.set(c._id.toString(), c.count));

  const result = services.map(s => ({
    ...s,
    clientsCount: countMap.get(s._id.toString()) || 0
  }));

  sendSuccess(res, 200, 'Success', result);
});

export const getServiceById = asyncHandler(async (req: Request, res: Response) => {
  const service = await Service.findOne({ _id: req.params.id, tenantId: req.tenantId })
    .populate('assignedUsers', 'name photoUrl');

  if (!service) throw new ApiError(404, 'Service not found');
  sendSuccess(res, 200, 'Success', service);
});

export const createService = asyncHandler(async (req: Request, res: Response) => {
  const data = serviceSchema.parse(req.body);
  const service = await Service.create({ tenantId: req.tenantId, ...(data as any) });
  sendSuccess(res, 201, 'Service created successfully', service);
});

export const updateService = asyncHandler(async (req: Request, res: Response) => {
  const data = serviceSchema.parse(req.body);
  const service = await Service.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    data,
    { new: true, runValidators: true }
  );
  if (!service) throw new ApiError(404, 'Service not found');
  sendSuccess(res, 200, 'Service updated successfully', service);
});

export const deleteService = asyncHandler(async (req: Request, res: Response) => {
  const service = await Service.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isEnabled: false },
    { new: true }
  );
  if (!service) throw new ApiError(404, 'Service not found');
  sendSuccess(res, 200, 'Service disabled successfully', service);
});
