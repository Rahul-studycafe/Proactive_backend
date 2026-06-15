import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/async-handler';
import { sendSuccess } from '../../../common/responses/api-response';
import { ApiError } from '../../../common/errors/api-error';
import { Client } from '../schemas';
import { z } from 'zod';

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
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  pan: z.string().optional(),
  gstin: z.string().optional(),
  photoUrl: z.string().optional(),
  groupId: z.string().optional(),
  tags: z.array(z.string()).optional(),
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
      .populate('tags', 'name color')
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
    .populate('tags', 'name color')
    .populate('assignedUsers', 'name photoUrl')
    .populate('subscribedServices.serviceId', 'name isRecurring frequency')
    .populate('subscribedServices.customUsers', 'name photoUrl');

  if (!client) throw new ApiError(404, 'Client not found');

  sendSuccess(res, 200, 'Success', client);
});

export const createClient = asyncHandler(async (req: Request, res: Response) => {
  const data = clientSchema.parse(req.body);
  const client = await Client.create({ tenantId: req.tenantId, ...(data as any) });
  sendSuccess(res, 201, 'Client created successfully', client);
});

export const updateClient = asyncHandler(async (req: Request, res: Response) => {
  const data = clientSchema.parse(req.body);
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
  sendSuccess(res, 200, 'Client soft-deleted successfully', client);
});
