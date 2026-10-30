import { Request, Response } from 'express';
import { z } from 'zod';
import { ClientUser } from '../models/ClientUser';
import { Client } from '../modules/clients/schemas/client.schema';
import { ApiError } from '../common/errors/api-error';
import { sendSuccess } from '../common/responses/api-response';
import { asyncHandler } from '../utils/async-handler';
import {
  generateClientToken,
  generateOtp,
  generateMagicLinkToken
} from '../services/client-auth.service';

/**
 * Password-based Client Portal Login
 * POST /api/v1/portal/auth/login
 */
export const portalLogin = asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    emailOrPhone: z.string().min(1, 'Email or phone number is required'),
    password: z.string().min(1, 'Password is required')
  });

  const { emailOrPhone, password } = schema.parse(req.body);
  const identifier = emailOrPhone.trim().toLowerCase();

  // Find user by email or phone (including password)
  const user = await ClientUser.findOne({
    $or: [
      { email: identifier },
      { phone: emailOrPhone.trim() }
    ]
  })
    .select('+password')
    .setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(401, 'Invalid email/phone or password', 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Your portal access account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email/phone or password', 'INVALID_CREDENTIALS');
  }

  // Verify parent client status
  const client = await Client.findById(user.clientId).setOptions({ skipTenantPlugin: true });
  if (!client || !client.isActive) {
    throw new ApiError(403, 'Client account is inactive or not found', 'CLIENT_INACTIVE');
  }

  if (!client.allowLogin) {
    throw new ApiError(
      403,
      'Portal access is currently not enabled for your organization. Please contact your accounting firm.',
      'PORTAL_ACCESS_DISABLED'
    );
  }

  // Update last login
  user.lastLoginAt = new Date();
  await user.save();

  const tokenData = generateClientToken({
    clientUserId: user._id.toString(),
    clientId: client._id.toString(),
    tenantId: user.tenantId.toString(),
    role: 'Client',
    isClient: true,
    tokenVersion: user.tokenVersion
  });

  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.otpSecret;

  return sendSuccess(res, 200, 'Sign in successful', {
    ...tokenData,
    user: userObj,
    client: {
      _id: client._id,
      name: client.name,
      fileNo: client.fileNo,
      entityType: client.entityType,
      pan: client.pan,
      gstin: client.gstin,
      photoUrl: client.photoUrl
    }
  });
});

/**
 * Request a 6-digit OTP to Email or Phone
 * POST /api/v1/portal/auth/request-otp
 */
export const portalRequestOtp = asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    identifier: z.string().min(1, 'Email or phone number is required')
  });

  const { identifier } = schema.parse(req.body);
  const normalized = identifier.trim().toLowerCase();

  const user = await ClientUser.findOne({
    $or: [
      { email: normalized },
      { phone: identifier.trim() }
    ]
  }).setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(404, 'No client account registered with this email or phone number', 'USER_NOT_FOUND');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Your portal account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  const client = await Client.findById(user.clientId).setOptions({ skipTenantPlugin: true });
  if (!client || !client.isActive || !client.allowLogin) {
    throw new ApiError(
      403,
      'Portal login is not enabled for this client organization',
      'PORTAL_ACCESS_DISABLED'
    );
  }

  const otp = generateOtp();
  user.otpSecret = {
    code: otp.code,
    expiresAt: otp.expiresAt,
    attempts: 0
  };
  await user.save();

  console.log(`[CLIENT PORTAL OTP] Generated code ${otp.code} for ${identifier}`);

  return sendSuccess(res, 200, 'Verification code sent successfully', {
    identifier,
    expiresInSeconds: 600,
    debugOtp: process.env.NODE_ENV !== 'production' ? otp.code : undefined
  });
});

/**
 * Verify 6-digit OTP and Issue Client JWT
 * POST /api/v1/portal/auth/verify-otp
 */
export const portalVerifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    identifier: z.string().min(1, 'Identifier is required'),
    code: z.string().min(6, 'Valid 6-digit code is required')
  });

  const { identifier, code } = schema.parse(req.body);
  const normalized = identifier.trim().toLowerCase();

  const user = await ClientUser.findOne({
    $or: [
      { email: normalized },
      { phone: identifier.trim() }
    ]
  }).setOptions({ skipTenantPlugin: true });

  if (!user || !user.otpSecret?.code) {
    throw new ApiError(400, 'No active OTP verification session found. Please request a new code.', 'INVALID_OTP');
  }

  if (new Date() > new Date(user.otpSecret.expiresAt)) {
    user.otpSecret = undefined;
    await user.save();
    throw new ApiError(400, 'Verification code has expired. Please request a new code.', 'OTP_EXPIRED');
  }

  if (user.otpSecret.code !== code.trim()) {
    user.otpSecret.attempts = (user.otpSecret.attempts || 0) + 1;
    await user.save();
    throw new ApiError(400, 'Invalid verification code. Please check and try again.', 'INVALID_OTP');
  }

  const client = await Client.findById(user.clientId).setOptions({ skipTenantPlugin: true });
  if (!client || !client.isActive || !client.allowLogin) {
    throw new ApiError(403, 'Portal login is not enabled for this client organization', 'PORTAL_ACCESS_DISABLED');
  }

  // Clear OTP secret and mark login
  user.otpSecret = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const tokenData = generateClientToken({
    clientUserId: user._id.toString(),
    clientId: client._id.toString(),
    tenantId: user.tenantId.toString(),
    role: 'Client',
    isClient: true,
    tokenVersion: user.tokenVersion
  });

  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.otpSecret;

  return sendSuccess(res, 200, 'Verification successful', {
    ...tokenData,
    user: userObj,
    client: {
      _id: client._id,
      name: client.name,
      fileNo: client.fileNo,
      entityType: client.entityType,
      pan: client.pan,
      gstin: client.gstin,
      photoUrl: client.photoUrl
    }
  });
});

/**
 * Dispatch One-Time Magic Link
 * POST /api/v1/portal/auth/send-magic-link
 */
export const portalSendMagicLink = asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email('Valid email address is required')
  });

  const { email } = schema.parse(req.body);
  const normalized = email.trim().toLowerCase();

  const user = await ClientUser.findOne({ email: normalized }).setOptions({ skipTenantPlugin: true });
  if (!user) {
    throw new ApiError(404, 'No client account registered with this email address', 'USER_NOT_FOUND');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Your portal account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  const client = await Client.findById(user.clientId).setOptions({ skipTenantPlugin: true });
  if (!client || !client.isActive || !client.allowLogin) {
    throw new ApiError(403, 'Portal login is not enabled for this client organization', 'PORTAL_ACCESS_DISABLED');
  }

  const magic = generateMagicLinkToken();
  user.magicLinkToken = magic.token;
  user.magicLinkExpiresAt = magic.expiresAt;
  await user.save();

  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3005';
  const magicUrl = `${portalUrl}/magic-login?token=${magic.token}`;
  console.log(`[CLIENT PORTAL MAGIC LINK] Generated magic link: ${magicUrl}`);

  return sendSuccess(res, 200, 'Magic link sent successfully to your email', {
    email: normalized,
    expiresInMinutes: 15,
    magicUrl: process.env.NODE_ENV !== 'production' ? magicUrl : undefined
  });
});

/**
 * Verify Magic Link and Issue Client JWT
 * POST /api/v1/portal/auth/verify-magic-link
 */
export const portalVerifyMagicLink = asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    token: z.string().min(10, 'Valid magic link token is required')
  });

  const { token } = schema.parse(req.body);

  const user = await ClientUser.findOne({ magicLinkToken: token }).setOptions({ skipTenantPlugin: true });
  if (!user) {
    throw new ApiError(400, 'Invalid or expired magic link. Please request a new link.', 'INVALID_MAGIC_LINK');
  }

  if (!user.magicLinkExpiresAt || new Date() > new Date(user.magicLinkExpiresAt)) {
    user.magicLinkToken = undefined;
    user.magicLinkExpiresAt = undefined;
    await user.save();
    throw new ApiError(400, 'Magic link has expired. Please request a new link.', 'MAGIC_LINK_EXPIRED');
  }

  const client = await Client.findById(user.clientId).setOptions({ skipTenantPlugin: true });
  if (!client || !client.isActive || !client.allowLogin) {
    throw new ApiError(403, 'Portal login is not enabled for this client organization', 'PORTAL_ACCESS_DISABLED');
  }

  // Clear magic token
  user.magicLinkToken = undefined;
  user.magicLinkExpiresAt = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const tokenData = generateClientToken({
    clientUserId: user._id.toString(),
    clientId: client._id.toString(),
    tenantId: user.tenantId.toString(),
    role: 'Client',
    isClient: true,
    tokenVersion: user.tokenVersion
  });

  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.magicLinkToken;

  return sendSuccess(res, 200, 'Authenticated via magic link successfully', {
    ...tokenData,
    user: userObj,
    client: {
      _id: client._id,
      name: client.name,
      fileNo: client.fileNo,
      entityType: client.entityType,
      pan: client.pan,
      gstin: client.gstin,
      photoUrl: client.photoUrl
    }
  });
});

/**
 * Sign out / Revoke Client Portal Token
 * POST /api/v1/portal/auth/logout
 */
export const portalLogout = asyncHandler(async (req: Request, res: Response) => {
  if (req.clientUser?._id) {
    await ClientUser.findByIdAndUpdate(req.clientUser._id, {
      $inc: { tokenVersion: 1 }
    }).setOptions({ skipTenantPlugin: true });
  }

  return sendSuccess(res, 200, 'Logged out successfully');
});
