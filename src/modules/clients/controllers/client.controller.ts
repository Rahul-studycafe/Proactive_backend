import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/async-handler';
import { sendSuccess } from '../../../common/responses/api-response';
import { ApiError } from '../../../common/errors/api-error';
import { Client } from '../schemas';
import { z } from 'zod';
import { triggerAutoDocumentRequestForService } from '../../../services/document-request.service';

const clientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  fileNo: z.string().optional(),
  entityType: z.enum([
    'Sole Proprietorship', 'Private Limited', 'Individual',
    'One Person Company', 'Partnership Firm', 'LLP',
    'Trust', 'NGO', 'HUF', 'Public Limited', 'Other'
  ]).optional(),
  email: z.string().email().optional().or(z.literal('')),
  mobile: z.string().optional(),
  secondaryMobile: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  pan: z.string().optional(),
  gstin: z.string().optional(),
  photoUrl: z.string().optional(),
  groupId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  billingProfileId: z.string().optional(),
  contactPersonName: z.string().optional(),
  dateOfBirth: z.string().datetime().optional().or(z.date().optional()),
  openingBalance: z.number().optional(),
  assignedUsers: z.array(z.string()).optional(),
  customFieldValues: z.record(z.string(), z.any()).optional(),
  subscribedServices: z.array(z.object({
    serviceId: z.string(),
    customPrice: z.number().optional(),
    customUsers: z.array(z.string()).optional()
  })).optional(),
  subscribedPackages: z.array(z.object({
    packageId: z.string(),
    customPrice: z.number().optional()
  })).optional(),
  autoInvoice: z.boolean().optional(),
  allowNotifications: z.boolean().optional(),
  allowLogin: z.boolean().optional(),
  isActive: z.boolean().optional()
});

export const getClients = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search as string;
  const isActive = req.query.isActive as string;

  let query: any = { tenantId: req.tenantId };
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { fileNo: { $regex: search, $options: 'i' } },
      { pan: { $regex: search, $options: 'i' } },
      { gstin: { $regex: search, $options: 'i' } }
    ];
  }

  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  const [clients, total] = await Promise.all([
    Client.find(query)
      .populate('groupId', 'name')
      .populate('assignedUsers', 'name photoUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Client.countDocuments(query)
  ]);

  sendSuccess(res, 200, 'Success', {
    clients,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  });
});

export const getClientById = asyncHandler(async (req: Request, res: Response) => {
  const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantId })
    .populate('groupId', 'name')
    .populate('assignedUsers', 'name photoUrl')
    .populate('subscribedServices.serviceId', 'name isRecurring frequency')
    .populate('subscribedServices.customUsers', 'name photoUrl')
    .populate({
      path: 'subscribedPackages.packageId',
      select: 'name frequency defaultBillingAmount sacCode gstPercentage serviceIds',
      populate: {
        path: 'serviceIds',
        select: 'name frequency isRecurring'
      }
    })
    .populate({
      path: 'tasks',
      select: 'serviceId status priority dueDate targetDate period isBillable billableAmount billingAmount assigneeIds description',
      populate: {
        path: 'serviceId',
        select: 'name'
      }
    });

  if (!client) throw new ApiError(404, 'Client not found');

  sendSuccess(res, 200, 'Success', client);
});

export const createClient = asyncHandler(async (req: Request, res: Response) => {
  const data = clientSchema.parse(req.body);
  const client = await Client.create({ tenantId: req.tenantId, ...(data as any) });

  if (client.subscribedServices && client.subscribedServices.length > 0) {
    for (const sub of client.subscribedServices) {
      await triggerAutoDocumentRequestForService(
        req.tenantId!,
        client._id,
        sub.serviceId,
        req.user?._id
      ).catch(err => console.error('[createClient] Auto doc request error:', err));
    }
  }

  sendSuccess(res, 201, 'Client created successfully', client);
});

export const updateClient = asyncHandler(async (req: Request, res: Response) => {
  const updateSchema = clientSchema.partial();
  const data = updateSchema.parse(req.body);
  const client = await Client.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    data,
    { new: true, runValidators: true }
  );
  if (!client) throw new ApiError(404, 'Client not found');
  sendSuccess(res, 200, 'Client updated successfully', client);
});

export const deleteClient = asyncHandler(async (req: Request, res: Response) => {
  const client = await Client.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: false },
    { new: true }
  );
  if (!client) throw new ApiError(404, 'Client not found');
  sendSuccess(res, 200, 'Client deleted successfully');
});

export const uploadClientPhoto = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No photo uploaded', 'FILE_REQUIRED');
  }

  // Generate URL for the uploaded file
  const photoUrl = `/public/uploads/clients/${req.file.filename}`;

  return sendSuccess(res, 200, 'Photo uploaded successfully', { photoUrl });
});

export const subscribeToPackage = asyncHandler(async (req: Request, res: Response) => {
  const { packageId, customPrice } = z.object({
    packageId: z.string(),
    customPrice: z.number().optional()
  }).parse(req.body);

  const Package = require('mongoose').model('Package');
  const pkg = await Package.findOne({ _id: packageId, tenantId: req.tenantId });
  if (!pkg) {
    throw new ApiError(404, 'Package not found');
  }

  const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!client) {
    throw new ApiError(404, 'Client not found');
  }

  // Check if already subscribed to this package
  const existingPkgIndex = client.subscribedPackages?.findIndex(
    p => ((p.packageId as any)?._id || p.packageId).toString() === packageId
  );
  if (existingPkgIndex !== undefined && existingPkgIndex >= 0) {
    if (customPrice !== undefined) {
      client.subscribedPackages[existingPkgIndex].customPrice = customPrice;
      await client.save();
      return sendSuccess(res, 200, 'Updated package subscription price successfully', client);
    }
    throw new ApiError(400, 'Client is already subscribed to this package', 'ALREADY_SUBSCRIBED');
  }

  // Add the package
  if (!client.subscribedPackages) {
    client.subscribedPackages = [];
  }
  client.subscribedPackages.push({
    packageId: pkg._id,
    customPrice: customPrice,
    subscribedAt: new Date()
  });

  // Also push all services from the package into subscribedServices if not already there
  if (!client.subscribedServices) {
    client.subscribedServices = [];
  }

  const existingServiceIds = client.subscribedServices.map(s => ((s.serviceId as any)?._id || s.serviceId).toString());
  
  const newServiceIds: any[] = [];
  for (const sId of pkg.serviceIds) {
    if (!existingServiceIds.includes(sId.toString())) {
      client.subscribedServices.push({
        serviceId: sId,
        customUsers: [],
        subscribedAt: new Date()
      });
      newServiceIds.push(sId);
    }
  }

  await client.save();

  // Trigger auto doc requests for newly subscribed services in package
  for (const sId of newServiceIds) {
    await triggerAutoDocumentRequestForService(
      req.tenantId!,
      client._id,
      sId,
      req.user?._id
    ).catch(err => console.error('[subscribeToPackage] Auto doc request error:', err));
  }

  return sendSuccess(res, 200, 'Subscribed to package successfully', client);
});

export const subscribeToService = asyncHandler(async (req: Request, res: Response) => {
  const { serviceId, customPrice } = z.object({
    serviceId: z.string(),
    customPrice: z.number().optional()
  }).parse(req.body);

  const Service = require('mongoose').model('Service');
  const svc = await Service.findOne({ _id: serviceId, tenantId: req.tenantId });
  if (!svc) {
    throw new ApiError(404, 'Service not found');
  }

  const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!client) {
    throw new ApiError(404, 'Client not found');
  }

  // Check if already subscribed to this service
  const existingSvcIndex = client.subscribedServices?.findIndex(
    s => ((s.serviceId as any)?._id || s.serviceId).toString() === serviceId
  );
  if (existingSvcIndex !== undefined && existingSvcIndex >= 0) {
    if (customPrice !== undefined) {
      client.subscribedServices[existingSvcIndex].customPrice = customPrice;
      await client.save();
      return sendSuccess(res, 200, 'Updated service subscription price successfully', client);
    }
    throw new ApiError(400, 'Client is already subscribed to this service', 'ALREADY_SUBSCRIBED');
  }

  if (!client.subscribedServices) {
    client.subscribedServices = [];
  }
  
  client.subscribedServices.push({
    serviceId: svc._id,
    customPrice: customPrice,
    customUsers: [],
    subscribedAt: new Date()
  });

  await client.save();

  // Trigger Auto Document Request if enabled on this service
  if (svc.autoDocCollection?.isEnabled) {
    await triggerAutoDocumentRequestForService(
      req.tenantId!,
      client._id,
      svc._id,
      req.user?._id
    ).catch(err => console.error('[subscribeToService] Auto doc request error:', err));
  }

  return sendSuccess(res, 200, 'Subscribed to service successfully', client);
});

export const unsubscribeFromPackage = asyncHandler(async (req: Request, res: Response) => {
  const { packageId } = req.params;
  const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!client) throw new ApiError(404, 'Client not found');

  if (client.subscribedPackages) {
    client.subscribedPackages = client.subscribedPackages.filter(
      p => p.packageId.toString() !== packageId && (p as any)._id?.toString() !== packageId
    );
    await client.save();
  }

  return sendSuccess(res, 200, 'Unsubscribed from package successfully', client);
});

export const unsubscribeFromService = asyncHandler(async (req: Request, res: Response) => {
  const { serviceId } = req.params;
  const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!client) throw new ApiError(404, 'Client not found');

  if (client.subscribedServices) {
    client.subscribedServices = client.subscribedServices.filter(
      s => s.serviceId.toString() !== serviceId && (s as any)._id?.toString() !== serviceId
    );
    await client.save();
  }

  return sendSuccess(res, 200, 'Unsubscribed from service successfully', client);
});
