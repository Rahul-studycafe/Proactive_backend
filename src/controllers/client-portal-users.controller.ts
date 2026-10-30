import { Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { ClientUser } from '../models/ClientUser';
import { Client } from '../modules/clients/schemas/client.schema';
import { ApiError } from '../common/errors/api-error';
import { sendSuccess } from '../common/responses/api-response';
import { asyncHandler } from '../utils/async-handler';

/**
 * List all portal users for a client
 * GET /api/v1/clients/:id/portal-users
 */
export const getClientPortalUsers = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId;

  const client = await Client.findOne({ _id: id, tenantId });
  if (!client) {
    throw new ApiError(404, 'Client not found', 'CLIENT_NOT_FOUND');
  }

  const portalUsers = await ClientUser.find({ clientId: client._id, tenantId })
    .sort({ isPrimaryContact: -1, createdAt: -1 });

  return sendSuccess(res, 200, 'Portal users retrieved successfully', {
    allowLogin: client.allowLogin,
    users: portalUsers
  });
});

/**
 * Create a new portal user for a client
 * POST /api/v1/clients/:id/portal-users
 */
export const createClientPortalUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId;

  const schema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Valid email address is required'),
    phone: z.string().min(8, 'Phone number is required'),
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
    isPrimaryContact: z.boolean().optional().default(false)
  });

  const parsed = schema.parse(req.body);

  const client = await Client.findOne({ _id: id, tenantId });
  if (!client) {
    throw new ApiError(404, 'Client not found', 'CLIENT_NOT_FOUND');
  }

  // Check if email already in use within tenant
  const existingEmail = await ClientUser.findOne({
    tenantId,
    email: parsed.email.trim().toLowerCase()
  });
  if (existingEmail) {
    throw new ApiError(400, 'A portal user with this email address already exists in your practice', 'EMAIL_IN_USE');
  }

  // If set as primary, demote any existing primary contact for this client
  if (parsed.isPrimaryContact) {
    await ClientUser.updateMany(
      { tenantId, clientId: client._id, isPrimaryContact: true },
      { $set: { isPrimaryContact: false } }
    );
  }

  const defaultPassword = parsed.password || 'Client@123';

  const portalUser = new ClientUser({
    tenantId,
    clientId: client._id,
    name: parsed.name.trim(),
    email: parsed.email.trim().toLowerCase(),
    phone: parsed.phone.trim(),
    password: defaultPassword,
    isPrimaryContact: parsed.isPrimaryContact,
    isActive: true
  });

  await portalUser.save();

  // If client.allowLogin is false, enable it automatically
  if (!client.allowLogin) {
    client.allowLogin = true;
    await client.save();
  }

  const userObj = portalUser.toObject();
  delete userObj.password;
  delete userObj.otpSecret;

  return sendSuccess(res, 201, 'Client portal user created successfully', userObj);
});

/**
 * Update an existing portal user
 * PUT /api/v1/clients/:id/portal-users/:userId
 */
export const updateClientPortalUser = asyncHandler(async (req: Request, res: Response) => {
  const { id, userId } = req.params;
  const tenantId = req.tenantId;

  const schema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(8).optional(),
    isPrimaryContact: z.boolean().optional(),
    isActive: z.boolean().optional()
  });

  const parsed = schema.parse(req.body);

  const client = await Client.findOne({ _id: id, tenantId });
  if (!client) {
    throw new ApiError(404, 'Client not found', 'CLIENT_NOT_FOUND');
  }

  const portalUser = await ClientUser.findOne({
    _id: userId,
    clientId: client._id,
    tenantId
  });

  if (!portalUser) {
    throw new ApiError(404, 'Portal user not found', 'USER_NOT_FOUND');
  }

  if (parsed.email && parsed.email.toLowerCase() !== portalUser.email) {
    const emailConflict = await ClientUser.findOne({
      tenantId,
      email: parsed.email.trim().toLowerCase(),
      _id: { $ne: portalUser._id }
    });
    if (emailConflict) {
      throw new ApiError(400, 'Another portal user already has this email', 'EMAIL_IN_USE');
    }
    portalUser.email = parsed.email.trim().toLowerCase();
  }

  if (parsed.name) portalUser.name = parsed.name.trim();
  if (parsed.phone) portalUser.phone = parsed.phone.trim();
  if (parsed.isActive !== undefined) portalUser.isActive = parsed.isActive;

  if (parsed.isPrimaryContact && !portalUser.isPrimaryContact) {
    await ClientUser.updateMany(
      { tenantId, clientId: client._id, isPrimaryContact: true },
      { $set: { isPrimaryContact: false } }
    );
    portalUser.isPrimaryContact = true;
  } else if (parsed.isPrimaryContact !== undefined) {
    portalUser.isPrimaryContact = parsed.isPrimaryContact;
  }

  await portalUser.save();

  const userObj = portalUser.toObject();
  delete userObj.password;
  delete userObj.otpSecret;

  return sendSuccess(res, 200, 'Portal user updated successfully', userObj);
});

/**
 * Delete a portal user
 * DELETE /api/v1/clients/:id/portal-users/:userId
 */
export const deleteClientPortalUser = asyncHandler(async (req: Request, res: Response) => {
  const { id, userId } = req.params;
  const tenantId = req.tenantId;

  const result = await ClientUser.findOneAndDelete({
    _id: userId,
    clientId: id,
    tenantId
  });

  if (!result) {
    throw new ApiError(404, 'Portal user not found', 'USER_NOT_FOUND');
  }

  return sendSuccess(res, 200, 'Portal user deleted successfully');
});

/**
 * Reset portal user password
 * POST /api/v1/clients/:id/portal-users/:userId/reset-password
 */
export const resetClientPortalUserPassword = asyncHandler(async (req: Request, res: Response) => {
  const { id, userId } = req.params;
  const tenantId = req.tenantId;

  const schema = z.object({
    newPassword: z.string().min(6, 'Password must be at least 6 characters')
  });

  const { newPassword } = schema.parse(req.body);

  const portalUser = await ClientUser.findOne({
    _id: userId,
    clientId: id,
    tenantId
  });

  if (!portalUser) {
    throw new ApiError(404, 'Portal user not found', 'USER_NOT_FOUND');
  }

  portalUser.password = newPassword;
  portalUser.tokenVersion += 1;
  await portalUser.save();

  return sendSuccess(res, 200, 'Password reset successfully');
});

/**
 * Toggle Client Portal Access (allowLogin)
 * PATCH /api/v1/clients/:id/portal-access
 */
export const toggleClientPortalAccess = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId;

  const schema = z.object({
    allowLogin: z.boolean()
  });

  const { allowLogin } = schema.parse(req.body);

  const client = await Client.findOne({ _id: id, tenantId });
  if (!client) {
    throw new ApiError(404, 'Client not found', 'CLIENT_NOT_FOUND');
  }

  client.allowLogin = allowLogin;
  await client.save();

  return sendSuccess(res, 200, `Portal access ${allowLogin ? 'enabled' : 'disabled'} successfully`, {
    allowLogin: client.allowLogin
  });
});
