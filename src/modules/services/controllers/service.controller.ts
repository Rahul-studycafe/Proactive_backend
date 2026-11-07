import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/async-handler';
import { sendSuccess } from '../../../common/responses/api-response';
import { ApiError } from '../../../common/errors/api-error';
import { Service } from '../schemas';
import { Package } from '../schemas/package.schema';
import { Client } from '../../clients/schemas/client.schema';
import '../../auth/schemas/user.schema';
import { Task } from '../../../models/Task';
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
  const service = await Service.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!service) throw new ApiError(404, 'Service not found');

  const { force } = req.query;

  // Check if any client is currently subscribed to this service
  const clientCount = await Client.countDocuments({
    tenantId: req.tenantId,
    'subscribedServices.serviceId': service._id
  });

  // Check if any tasks are linked to this service
  const taskCount = await Task.countDocuments({
    tenantId: req.tenantId,
    serviceId: service._id
  });

  if (force === 'true') {
    // If forced, clean up client subscriptions and remove service
    await Client.updateMany(
      { tenantId: req.tenantId, 'subscribedServices.serviceId': service._id },
      { $pull: { subscribedServices: { serviceId: service._id } } }
    );
    await Service.deleteOne({ _id: service._id, tenantId: req.tenantId });
    return sendSuccess(res, 200, 'Service deleted and removed from client subscriptions');
  }

  if (clientCount > 0) {
    throw new ApiError(
      400,
      `Cannot delete '${service.name}' because ${clientCount} client(s) are actively subscribed to it. You can disable the service to prevent new subscriptions, or remove it from the client(s) first.`
    );
  }

  if (taskCount > 0) {
    throw new ApiError(
      400,
      `Cannot delete '${service.name}' because ${taskCount} task(s) are linked to it. Disable the service instead to preserve compliance audit trail.`
    );
  }

  await Service.deleteOne({ _id: service._id, tenantId: req.tenantId });
  sendSuccess(res, 200, 'Service blueprint deleted permanently');
});

export const getServiceClients = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId;

  const service = await Service.findOne({ _id: id, tenantId });
  if (!service) throw new ApiError(404, 'Service not found');

  // Find any packages containing this service
  const packages = await Package.find({ tenantId, serviceIds: service._id }).select('_id name');
  const packageIds = packages.map(p => p._id);

  // Find all clients subscribed directly or via a package
  const clients = await Client.find({
    tenantId,
    $or: [
      { 'subscribedServices.serviceId': service._id },
      { 'subscribedPackages.packageId': { $in: packageIds } }
    ]
  })
    .select('name clientNumber fileNo entityType email mobile pan gstin isActive subscribedServices subscribedPackages assignedUsers createdAt')
    .populate('assignedUsers', 'name photoUrl')
    .sort({ name: 1 })
    .lean();

  const clientIds = clients.map(c => c._id);
  const taskCounts = await Task.aggregate([
    { $match: { tenantId, serviceId: service._id, clientId: { $in: clientIds } } },
    { $group: { _id: '$clientId', total: { $sum: 1 }, pending: { $sum: { $cond: [{ $in: ['$status', ['Pending', 'In Progress', 'Review']] }, 1, 0] } } } }
  ]);
  const taskCountMap = new Map();
  taskCounts.forEach(t => taskCountMap.set(t._id.toString(), t));

  const result = clients.map(c => {
    const directSub = (c.subscribedServices || []).find(
      (s: any) => s.serviceId?.toString() === service._id.toString()
    );
    const viaPkg = (c.subscribedPackages || []).find(
      (p: any) => packageIds.some(pkgId => pkgId.toString() === p.packageId?.toString())
    );

    const taskStats = taskCountMap.get(c._id.toString()) || { total: 0, pending: 0 };

    return {
      _id: c._id,
      name: c.name,
      clientNumber: c.clientNumber || c.fileNo,
      fileNo: c.clientNumber || c.fileNo,
      entityType: c.entityType,
      email: c.email,
      mobile: c.mobile,
      pan: c.pan,
      gstin: c.gstin,
      isActive: c.isActive,
      customPrice: directSub?.customPrice ?? null,
      effectivePrice: directSub?.customPrice ?? service.defaultBillingRate ?? 0,
      subscribedAt: directSub?.subscribedAt || (c as any).createdAt,
      subscriptionSource: directSub ? 'Direct Retainer' : viaPkg ? 'Commercial Package' : 'Direct Retainer',
      assignedUsers: c.assignedUsers || [],
      totalTasks: taskStats.total,
      pendingTasks: taskStats.pending
    };
  });

  sendSuccess(res, 200, 'Subscribed clients retrieved successfully', result);
});
