import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import {
  DocumentRequest,
  IDocumentRequest,
  IRequestedFileItem,
  DocumentRequestStatus,
  RequestedItemStatus
} from '../models/DocumentRequest';
import { DocumentModel } from '../models/Document';
import { TaskHistory } from '../models/TaskHistory';
import { Task } from '../models/Task';
import { Client } from '../modules/clients/schemas/client.schema';
import { Organization } from '../modules/auth/schemas/organization.schema';
import { User } from '../modules/auth/schemas/user.schema';
import { Service } from '../modules/services/schemas/service.schema';
import { ApiError } from '../common/errors/api-error';
import { getNextDocumentRequestNumber } from './sequence.service';
import { sendDocumentRequestEmail } from './email.service';

export interface CreateRequestedFileItemInput {
  name: string;
  description?: string;
  isRequired?: boolean;
  acceptedFormats?: string[];
}

export interface CreateDocumentRequestInput {
  clientId: string;
  taskId?: string;
  title: string;
  instructions?: string;
  expiresInDays?: number;
  items: CreateRequestedFileItemInput[];
}

export interface GetDocumentRequestsQuery {
  page?: number | string;
  limit?: number | string;
  clientId?: string;
  taskId?: string;
  status?: DocumentRequestStatus;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc' | 1 | -1;
}

/**
 * Creates a new document request checklist and dispatches a magic upload link
 */
export const createDocumentRequestService = async (
  tenantId: mongoose.Types.ObjectId,
  data: CreateDocumentRequestInput,
  currentUserId: mongoose.Types.ObjectId
) => {
  // Validate Client existence
  const client = await Client.findOne({ _id: data.clientId, tenantId });
  if (!client) {
    throw new ApiError(404, 'Client not found', 'CLIENT_NOT_FOUND');
  }

  // Validate Task existence if provided
  let taskObjId: mongoose.Types.ObjectId | undefined;
  if (data.taskId) {
    if (!mongoose.Types.ObjectId.isValid(data.taskId)) {
      throw new ApiError(400, 'Invalid task ID format', 'VALIDATION_ERROR');
    }
    const task = await Task.findOne({ _id: data.taskId, tenantId });
    if (!task) {
      throw new ApiError(404, 'Task not found', 'TASK_NOT_FOUND');
    }
    taskObjId = task._id as mongoose.Types.ObjectId;
  }

  if (!data.items || data.items.length === 0) {
    throw new ApiError(
      400,
      'At least one document item must be requested',
      'VALIDATION_ERROR'
    );
  }

  // Generate 64-char cryptographic token
  const token = crypto.randomBytes(32).toString('hex');

  // Generate sequential request number (e.g. DREQ-1001)
  const requestNo = await getNextDocumentRequestNumber(tenantId);

  // Expiration calculation (default 7 days)
  const days = data.expiresInDays && data.expiresInDays > 0 ? data.expiresInDays : 7;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  // Format checklist items
  const items: IRequestedFileItem[] = data.items.map((item) => ({
    name: item.name.trim(),
    description: item.description?.trim(),
    isRequired: item.isRequired !== undefined ? Boolean(item.isRequired) : true,
    acceptedFormats:
      item.acceptedFormats && item.acceptedFormats.length > 0
        ? item.acceptedFormats.map((f) => f.toLowerCase().trim())
        : ['.pdf', '.xlsx', '.csv', '.zip', '.png', '.jpg'],
    status: 'Pending'
  }));

  const docRequest = await DocumentRequest.create({
    tenantId,
    clientId: new mongoose.Types.ObjectId(data.clientId),
    taskId: taskObjId,
    requestNo,
    title: data.title.trim(),
    instructions: data.instructions?.trim(),
    token,
    items,
    expiresAt,
    status: 'Pending',
    createdBy: currentUserId
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
  const uploadUrl = `${frontendUrl}/public/upload/${token}`;

  // Organization branding for email
  const organization = await Organization.findById(tenantId);
  const firmName = organization?.name || 'Proactive Accounting Suite';

  // Dispatch email notification to client if email exists
  let emailDispatched = false;
  if (client.email) {
    const itemsList = items.map(
      (it) => `${it.name}${it.isRequired ? ' *' : ' (Optional)'}`
    );
    const expiresAtStr = expiresAt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const emailRes = await sendDocumentRequestEmail(
      client.email,
      client.name,
      firmName,
      docRequest.title,
      itemsList,
      uploadUrl,
      expiresAtStr
    );
    emailDispatched = Boolean(emailRes);
  }

  const populated = await DocumentRequest.findById(docRequest._id)
    .populate('clientId', 'name email mobile')
    .populate('taskId', 'description status priority')
    .populate('createdBy', 'name email');

  return {
    ...populated?.toObject(),
    uploadUrl,
    emailDispatched
  };
};

/**
 * Public resolver for non-authenticated clients to view checklist metadata
 */
export const getPublicDocumentRequestByTokenService = async (token: string) => {
  if (!token || token.trim().length !== 64) {
    throw new ApiError(400, 'Invalid or malformed document request token', 'INVALID_TOKEN');
  }

  // Must skip tenant plugin since client is not logged in
  const request = await DocumentRequest.findOne({ token }).setOptions({
    skipTenantPlugin: true
  });

  if (!request) {
    throw new ApiError(404, 'Document request not found or link has expired', 'REQUEST_NOT_FOUND');
  }

  if (request.status === 'Cancelled') {
    throw new ApiError(
      400,
      'This document request was cancelled by the firm',
      'DOCUMENT_REQUEST_CANCELLED'
    );
  }

  // Check if expired
  if (request.expiresAt < new Date()) {
    if (request.status !== 'Expired') {
      request.status = 'Expired';
      await request.save();
    }
    throw new ApiError(
      410,
      'This document request link has expired',
      'DOCUMENT_REQUEST_EXPIRED'
    );
  }

  // Get tenant firm branding & client name
  const organization = await Organization.findById(request.tenantId);
  const client = await Client.findById(request.clientId).setOptions({
    skipTenantPlugin: true
  });

  return {
    requestNo: request.requestNo,
    title: request.title,
    instructions: request.instructions,
    status: request.status,
    expiresAt: request.expiresAt,
    items: request.items.map((item) => ({
      _id: item._id,
      name: item.name,
      description: item.description,
      isRequired: item.isRequired,
      acceptedFormats: item.acceptedFormats,
      status: item.status,
      uploadedAt: item.uploadedAt
    })),
    client: {
      name: client?.name || 'Valued Client'
    },
    firm: {
      name: organization?.name || 'Accounting Office',
      address: organization?.address
        ? `${organization.address.city}, ${organization.address.state}`
        : ''
    }
  };
};

/**
 * Public file upload handler (non-authenticated multipart endpoint)
 */
export const uploadPublicFileService = async (
  token: string,
  itemId: string,
  file: Express.Multer.File
) => {
  if (!token || token.trim().length !== 64) {
    throw new ApiError(400, 'Invalid or malformed token', 'INVALID_TOKEN');
  }

  if (!file) {
    throw new ApiError(400, 'No file uploaded', 'FILE_MISSING');
  }

  const request = await DocumentRequest.findOne({ token }).setOptions({
    skipTenantPlugin: true
  });

  if (!request) {
    throw new ApiError(404, 'Document request not found', 'REQUEST_NOT_FOUND');
  }

  if (request.status === 'Cancelled') {
    throw new ApiError(
      400,
      'This document request was cancelled',
      'DOCUMENT_REQUEST_CANCELLED'
    );
  }

  if (request.expiresAt < new Date()) {
    if (request.status !== 'Expired') {
      request.status = 'Expired';
      await request.save();
    }
    throw new ApiError(
      410,
      'This document request link has expired',
      'DOCUMENT_REQUEST_EXPIRED'
    );
  }

  // Find target item in checklist
  const item = request.items.find((it) => it._id?.toString() === itemId);
  if (!item) {
    throw new ApiError(404, 'Requested item not found in checklist', 'ITEM_NOT_FOUND');
  }

  // Validate file extension against allowed formats
  const ext = path.extname(file.originalname).toLowerCase();
  const disallowedExts = ['.exe', '.sh', '.bat', '.cmd', '.msi', '.vbs', '.php', '.js'];
  if (disallowedExts.includes(ext)) {
    throw new ApiError(
      400,
      `File format "${ext}" is strictly forbidden for security reasons`,
      'FORBIDDEN_FILE_TYPE'
    );
  }

  if (
    item.acceptedFormats &&
    item.acceptedFormats.length > 0 &&
    !item.acceptedFormats.map((f) => f.toLowerCase()).includes(ext)
  ) {
    throw new ApiError(
      400,
      `Invalid format "${ext}". Accepted formats: ${item.acceptedFormats.join(', ')}`,
      'INVALID_FILE_TYPE'
    );
  }

  // Construct target directory inside public storage
  const targetDir = path.join(
    process.cwd(),
    'public',
    'uploads',
    'documents',
    request.tenantId.toString(),
    request.clientId.toString()
  );
  fs.mkdirSync(targetDir, { recursive: true });

  const finalFileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const finalFilePath = path.join(targetDir, finalFileName);

  // If multer stored file in a temp path, move it; otherwise write buffer
  if (file.path) {
    fs.copyFileSync(file.path, finalFilePath);
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}
  } else if (file.buffer) {
    fs.writeFileSync(finalFilePath, file.buffer);
  }

  const fileUrl = `/public/uploads/documents/${request.tenantId}/${request.clientId}/${finalFileName}`;

  // Create Document record in client repository vault
  const doc = await DocumentModel.create({
    tenantId: request.tenantId,
    clientId: request.clientId,
    taskId: request.taskId,
    category: 'document',
    fileName: file.originalname,
    fileUrl,
    uploadedBy: request.createdBy
  });

  // Update item in checklist
  item.status = 'Uploaded';
  item.uploadedDocumentId = doc._id as mongoose.Types.ObjectId;
  item.uploadedAt = new Date();

  // Recalculate request progress and overall status
  const totalItems = request.items.length;
  const uploadedCount = request.items.filter((it) => it.status === 'Uploaded').length;
  const requiredItems = request.items.filter((it) => it.isRequired);
  const requiredUploaded = requiredItems.filter((it) => it.status === 'Uploaded').length;

  if (uploadedCount === totalItems || (requiredItems.length > 0 && requiredUploaded === requiredItems.length)) {
    request.status = 'Completed';
  } else {
    request.status = 'Partially Uploaded';
  }

  await request.save();

  // Append Task History audit message if task is associated
  if (request.taskId) {
    await TaskHistory.create({
      tenantId: request.tenantId,
      taskId: request.taskId,
      action: 'Document Uploaded',
      details: `Client uploaded "${file.originalname}" for item "${item.name}" via Request #${request.requestNo}`,
      createdBy: request.createdBy
    });
  }

  return {
    success: true,
    requestNo: request.requestNo,
    status: request.status,
    item: {
      _id: item._id,
      name: item.name,
      status: item.status,
      uploadedAt: item.uploadedAt,
      documentId: doc._id
    },
    progress: {
      uploaded: uploadedCount,
      total: totalItems,
      isFullyCompleted: request.status === 'Completed'
    }
  };
};

/**
 * Returns paginated document requests for staff oversight
 */
export const getDocumentRequestListService = async (
  tenantId: mongoose.Types.ObjectId,
  query: GetDocumentRequestsQuery
) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: any = { tenantId };

  if (query.clientId && mongoose.Types.ObjectId.isValid(query.clientId)) {
    filter.clientId = new mongoose.Types.ObjectId(query.clientId);
  }

  if (query.taskId && mongoose.Types.ObjectId.isValid(query.taskId)) {
    filter.taskId = new mongoose.Types.ObjectId(query.taskId);
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.search && query.search.trim()) {
    const regex = new RegExp(query.search.trim(), 'i');
    filter.$or = [{ requestNo: regex }, { title: regex }, { instructions: regex }];
  }

  const sortField = query.sortBy || 'createdAt';
  const sortDirection =
    query.sortOrder === 'asc' || query.sortOrder === 1 ? 1 : -1;
  const sortOptions: any = { [sortField]: sortDirection, _id: -1 };

  const [items, totalMatching, pendingCount, partiallyCount, completedCount, expiredCount] =
    await Promise.all([
      DocumentRequest.find(filter)
        .populate('clientId', 'name email mobile')
        .populate('taskId', 'description status priority')
        .populate('createdBy', 'name email')
        .populate('items.uploadedDocumentId', 'fileName fileUrl createdAt')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      DocumentRequest.countDocuments(filter),
      DocumentRequest.countDocuments({ tenantId, status: 'Pending' }),
      DocumentRequest.countDocuments({ tenantId, status: 'Partially Uploaded' }),
      DocumentRequest.countDocuments({ tenantId, status: 'Completed' }),
      DocumentRequest.countDocuments({ tenantId, status: 'Expired' })
    ]);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';

  // Compute progress for each request item
  const formattedItems = items.map((req: any) => {
    const totalFiles = req.items?.length || 0;
    const uploadedFiles = req.items?.filter((it: any) => it.status === 'Uploaded').length || 0;
    const progressPercentage =
      totalFiles > 0 ? Math.round((uploadedFiles / totalFiles) * 100) : 0;

    return {
      ...req,
      uploadUrl: `${frontendUrl}/public/upload/${req.token}`,
      progress: {
        totalFiles,
        uploadedFiles,
        progressPercentage
      }
    };
  });

  const totalPages = Math.ceil(totalMatching / limit) || 1;

  return {
    data: formattedItems,
    meta: {
      total: totalMatching,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    },
    summary: {
      pending: pendingCount,
      partiallyUploaded: partiallyCount,
      completed: completedCount,
      expired: expiredCount,
      totalRequests: pendingCount + partiallyCount + completedCount + expiredCount
    }
  };
};

/**
 * Gets a single document request by ID with full references
 */
export const getDocumentRequestByIdService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid request ID format', 'VALIDATION_ERROR');
  }

  const req = await DocumentRequest.findOne({ _id: id, tenantId })
    .populate('clientId', 'name email mobile address')
    .populate('taskId', 'description status priority dueDate')
    .populate('createdBy', 'name email')
    .populate('items.uploadedDocumentId', 'fileName fileUrl createdAt');

  if (!req) {
    throw new ApiError(404, 'Document request not found', 'REQUEST_NOT_FOUND');
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
  const totalFiles = req.items.length;
  const uploadedFiles = req.items.filter((it) => it.status === 'Uploaded').length;
  const progressPercentage =
    totalFiles > 0 ? Math.round((uploadedFiles / totalFiles) * 100) : 0;

  return {
    ...req.toObject(),
    uploadUrl: `${frontendUrl}/public/upload/${req.token}`,
    progress: {
      totalFiles,
      uploadedFiles,
      progressPercentage
    }
  };
};

/**
 * Resends document request email reminder to the client
 */
export const resendDocumentRequestService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid request ID format', 'VALIDATION_ERROR');
  }

  const req = await DocumentRequest.findOne({ _id: id, tenantId });
  if (!req) {
    throw new ApiError(404, 'Document request not found', 'REQUEST_NOT_FOUND');
  }

  if (req.status === 'Cancelled') {
    throw new ApiError(400, 'Cannot resend a cancelled document request', 'INVALID_OPERATION');
  }

  if (req.status === 'Expired' || req.expiresAt < new Date()) {
    throw new ApiError(400, 'Cannot resend an expired request. Please extend expiry or create a new request.', 'REQUEST_EXPIRED');
  }

  const client = await Client.findOne({ _id: req.clientId, tenantId });
  if (!client || !client.email) {
    throw new ApiError(400, 'Client does not have a registered email address', 'CLIENT_EMAIL_MISSING');
  }

  const organization = await Organization.findById(tenantId);
  const firmName = organization?.name || 'Proactive Accounting Suite';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
  const uploadUrl = `${frontendUrl}/public/upload/${req.token}`;

  const itemsList = req.items.map(
    (it) => `${it.name}${it.isRequired ? ' *' : ' (Optional)'}`
  );
  const expiresAtStr = req.expiresAt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const emailRes = await sendDocumentRequestEmail(
    client.email,
    client.name,
    firmName,
    req.title,
    itemsList,
    uploadUrl,
    expiresAtStr
  );

  return {
    requestNo: req.requestNo,
    emailSentTo: client.email,
    uploadUrl,
    dispatched: Boolean(emailRes)
  };
};

/**
 * Cancels a document request and invalidates the public token
 */
export const cancelDocumentRequestService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid request ID format', 'VALIDATION_ERROR');
  }

  const req = await DocumentRequest.findOne({ _id: id, tenantId });
  if (!req) {
    throw new ApiError(404, 'Document request not found', 'REQUEST_NOT_FOUND');
  }

  req.status = 'Cancelled';
  await req.save();

  return {
    _id: req._id,
    requestNo: req.requestNo,
    status: req.status
  };
};

/**
 * Scans for expired document requests and transitions them to 'Expired'
 */
export const scanExpiredDocumentRequestsService = async (
  tenantId?: mongoose.Types.ObjectId,
  referenceDate: Date = new Date()
) => {
  const matchFilter: any = {
    status: { $in: ['Pending', 'Partially Uploaded'] },
    expiresAt: { $lt: referenceDate }
  };

  if (tenantId) {
    matchFilter.tenantId = tenantId;
  }

  const result = await DocumentRequest.updateMany(matchFilter, {
    $set: { status: 'Expired' }
  });

  return {
    referenceDate,
    updatedExpiredCount: result.modifiedCount
  };
};

/**
 * Triggers an automated document request for a client when a service is subscribed or executed,
 * provided the service has autoDocCollection.isEnabled === true.
 */
export const triggerAutoDocumentRequestForService = async (
  tenantId: mongoose.Types.ObjectId,
  clientId: string | mongoose.Types.ObjectId,
  serviceId: string | mongoose.Types.ObjectId,
  userId?: mongoose.Types.ObjectId,
  taskId?: string | mongoose.Types.ObjectId
) => {
  try {
    const svc = await Service.findOne({ _id: serviceId, tenantId });
    if (!svc || !svc.autoDocCollection?.isEnabled) {
      return null;
    }

    let creatorId = userId;
    if (!creatorId) {
      const fallbackUser = await User.findOne({ tenantId, isActive: true });
      if (fallbackUser) {
        creatorId = fallbackUser._id;
      } else {
        const anyUser = await User.findOne({ tenantId });
        creatorId = anyUser?._id;
      }
    }

    if (!creatorId) {
      console.warn('[triggerAutoDocumentRequestForService] No creator user found for tenant:', tenantId);
      return null;
    }

    const defaultMsg =
      svc.autoDocCollection.defaultMessage?.trim() ||
      `Please provide the required documents for ${svc.name}.`;
    const requestTitle = `Document Request: ${svc.name}`;

    // 1. Idempotency Check: if taskId is provided, avoid duplicate request for this task
    if (taskId) {
      const existingTaskDocReq = await DocumentRequest.findOne({
        tenantId,
        taskId: new mongoose.Types.ObjectId(taskId.toString()),
        status: { $nin: ['Cancelled', 'Expired'] }
      });
      if (existingTaskDocReq) {
        return existingTaskDocReq;
      }
    }

    // 2. Idempotency Check: check if an active pending/partially uploaded request already exists for this client and service
    const existingActiveDocReq = await DocumentRequest.findOne({
      tenantId,
      clientId: new mongoose.Types.ObjectId(clientId.toString()),
      title: requestTitle,
      status: { $in: ['Pending', 'Partially Uploaded'] }
    });

    if (existingActiveDocReq) {
      // If an existing request exists (e.g. from service subscription) without a taskId,
      // and we now have a taskId from task generation, attach it to link them together!
      if (taskId && !existingActiveDocReq.taskId) {
        existingActiveDocReq.taskId = new mongoose.Types.ObjectId(taskId.toString());
        await existingActiveDocReq.save();
      }
      return existingActiveDocReq;
    }

    return await createDocumentRequestService(
      tenantId,
      {
        clientId: clientId.toString(),
        taskId: taskId ? taskId.toString() : undefined,
        title: requestTitle,
        instructions: defaultMsg,
        expiresInDays: 7,
        items: [
          {
            name: `${svc.name} Required Documents`,
            description: defaultMsg,
            isRequired: true
          }
        ]
      },
      creatorId
    );
  } catch (err) {
    console.error('[triggerAutoDocumentRequestForService] Error creating automated document request:', err);
    return null;
  }
};
