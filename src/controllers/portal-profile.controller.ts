import { Request, Response } from 'express';
import { z } from 'zod';
import { ClientUser } from '../models/ClientUser';
import { Client } from '../modules/clients/schemas/client.schema';
import { Organization } from '../modules/auth/schemas';
import { ApiError } from '../common/errors/api-error';
import { sendSuccess } from '../common/responses/api-response';
import { asyncHandler } from '../utils/async-handler';

/**
 * Get Client Portal Profile (User, Company Legal Entity, and CA Firm Contact)
 * GET /api/v1/portal/profile
 */
export const getPortalProfile = asyncHandler(async (req: Request, res: Response) => {
  const clientUserId = req.clientUser?._id;
  const clientId = req.clientId;
  const tenantId = req.tenantId;

  if (!clientUserId || !clientId || !tenantId) {
    throw new ApiError(401, 'Unauthorized client portal request', 'UNAUTHORIZED');
  }

  const [user, client, org] = await Promise.all([
    ClientUser.findById(clientUserId).setOptions({ skipTenantPlugin: true }),
    Client.findById(clientId).setOptions({ skipTenantPlugin: true }),
    Organization.findById(tenantId)
  ]);

  if (!user || !user.isActive) {
    throw new ApiError(404, 'Portal user not found or deactivated', 'USER_NOT_FOUND');
  }

  if (!client || !client.isActive || !client.allowLogin) {
    throw new ApiError(403, 'Client account inactive or portal disabled', 'PORTAL_ACCESS_DISABLED');
  }

  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.otpSecret;

  return sendSuccess(res, 200, 'Profile retrieved successfully', {
    user: userObj,
    client: {
      _id: client._id,
      name: client.name,
      clientNumber: client.clientNumber || client.fileNo,
      fileNo: client.clientNumber || client.fileNo,
      entityType: client.entityType,
      pan: client.pan,
      gstin: client.gstin,
      address: client.address,
      city: client.city,
      state: client.state,
      pincode: client.pincode,
      email: client.email,
      mobile: client.mobile,
      photoUrl: client.photoUrl
    },
    practice: {
      name: org?.name || 'Chartered Accountants',
      company: org?.company || '',
      email: org?.email || '',
      phone: org?.phone || '',
      address: org?.address
        ? `${org.address.addressLine1 || ''}${org.address.city ? ', ' + org.address.city : ''}`
        : ''
    }
  });
});

/**
 * Update Client User Self Profile (Name, Phone, Email)
 * PUT /api/v1/portal/profile
 */
export const updatePortalProfile = asyncHandler(async (req: Request, res: Response) => {
  const clientUserId = req.clientUser?._id;
  if (!clientUserId) {
    throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
  }

  const schema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    phone: z.string().min(8, 'Phone number is required').optional(),
    email: z.string().email('Valid email address is required').optional()
  });

  const parsed = schema.parse(req.body);

  const user = await ClientUser.findById(clientUserId).setOptions({ skipTenantPlugin: true });
  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (parsed.name) user.name = parsed.name.trim();
  if (parsed.phone) user.phone = parsed.phone.trim();
  if (parsed.email) user.email = parsed.email.trim().toLowerCase();

  await user.save();

  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.otpSecret;

  return sendSuccess(res, 200, 'Profile updated successfully', userObj);
});

/**
 * Change Client User Password
 * POST /api/v1/portal/auth/change-password
 */
export const changePortalPassword = asyncHandler(async (req: Request, res: Response) => {
  const clientUserId = req.clientUser?._id;
  if (!clientUserId) {
    throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
  }

  const schema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters')
  });

  const { currentPassword, newPassword } = schema.parse(req.body);

  const user = await ClientUser.findById(clientUserId)
    .select('+password')
    .setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  // If user already has a password set, verify it
  if (user.password) {
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new ApiError(400, 'Current password does not match', 'INCORRECT_PASSWORD');
    }
  }

  user.password = newPassword;
  user.tokenVersion += 1; // Invalidate other sessions
  await user.save();

  return sendSuccess(res, 200, 'Password updated successfully. Please use your new password next time you sign in.');
});
