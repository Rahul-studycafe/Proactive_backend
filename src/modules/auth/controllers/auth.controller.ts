import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/async-handler';
import { ApiError } from '../../../common/errors/api-error';
import { sendSuccess } from '../../../common/responses/api-response';
import { Organization } from '../schemas';
import { User } from '../schemas';
import { Role } from '../../roles/schemas/index';
import { BillingEntity } from '../../masters/schemas/index';
import { TenantSettings } from '../../masters/schemas/index';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../services/auth.service';
import z from 'zod';

const registerSchema = z.object({
  orgName: z.string().min(2),
  name: z.string().min(2),
  username: z.string().min(4),
  password: z.string().min(6),
  email: z.string().email().optional(),
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  // Validate request body
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const { orgName, name, username, password, email } = parsed.data;

  // Check if username already exists globally (skip tenant plugin — no context yet)
  const existingUser = await User.findOne({ username }).setOptions({ skipTenantPlugin: true });
  if (existingUser) {
    throw new ApiError(409, 'Username already taken', 'USERNAME_TAKEN');
  }

  // Generate a unique slug for the organization
  let baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  let slug = baseSlug;
  let counter = 1;
  while (await Organization.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  try {
    // 1. Create Organization
    const org = new Organization({
      name: orgName,
      slug,
      plan: {
        maxUsers: 5
      }
    });
    await org.save();

    // 2. Create Super Admin Role
    const superAdminRole = new Role({
      tenantId: org._id,
      name: 'Super Admin',
      description: 'System generated super admin role',
      isSuperAdmin: true,
      permissions: {}
    });
    await superAdminRole.save();

    // 3. Create User
    const user = new User({
      tenantId: org._id,
      name,
      username,
      password, // hashed by pre-save hook
      email,
      roleId: superAdminRole._id,
      tokenVersion: 1
    });
    await user.save();

    // 4. Create Default BillingEntity
    const billing = new BillingEntity({
      tenantId: org._id,
      name: orgName,
      invoicePrefix: 'INV-',
      receiptPrefix: 'RCT-'
    });
    await billing.save();

    // 5. Create TenantSettings
    const settings = new TenantSettings({
      tenantId: org._id,
      clientCustomFields: [],
      allowDuplicateClientNames: false,
      defaultGstPercentage: 18
    });
    await settings.save();

    // Generate Tokens
    const tokenPayload = {
      userId: user._id.toString(),
      tenantId: org._id.toString(),
      roleId: superAdminRole._id.toString(),
      tokenVersion: user.tokenVersion
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    user.refreshToken = refreshToken;
    await user.save();

    return sendSuccess(res, 201, 'Registration successful', {
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        role: 'Super Admin'
      },
      organization: {
        _id: org._id,
        name: org.name,
        slug: org.slug
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ApiError(500, 'Registration failed during document creation', 'REGISTRATION_FAILED', [errorMessage]);
  }
});

const loginSchema = z.object({
  orgSlug: z.string().min(2),
  username: z.string().min(4),
  password: z.string().min(6)
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const { orgSlug, username, password } = parsed.data;

  const org = await Organization.findOne({ slug: orgSlug });
  if (!org) {
    throw new ApiError(401, 'Invalid organization slug or credentials', 'INVALID_CREDENTIALS');
  }

  const user = await User.findOne({ username, tenantId: org._id })
    .select('+password')
    .setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(401, 'Invalid organization slug or credentials', 'INVALID_CREDENTIALS');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid organization slug or credentials', 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  const tokenPayload = {
    userId: user._id.toString(),
    tenantId: org._id.toString(),
    roleId: user.roleId.toString(),
    tokenVersion: user.tokenVersion
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  user.refreshToken = refreshToken;
  await user.save();

  return sendSuccess(res, 200, 'Login successful', {
    accessToken,
    refreshToken,
    user: {
      _id: user._id,
      name: user.name,
      username: user.username,
      roleId: user.roleId
    },
    organization: {
      _id: org._id,
      name: org.name,
      slug: org.slug
    }
  });
});

const refreshSchema = z.object({
  refreshToken: z.string()
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'Refresh token is required', 'VALIDATION_FAILED');
  }

  const { refreshToken } = parsed.data;
  
  const payload = verifyRefreshToken(refreshToken);

  const user = await User.findById(payload.userId).select('+refreshToken').setOptions({ skipTenantPlugin: true });
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    throw new ApiError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  if (user.refreshToken !== refreshToken) {
    throw new ApiError(401, 'Refresh token has been revoked or superseded', 'REVOKED_REFRESH_TOKEN');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  const tokenPayload = {
    userId: user._id.toString(),
    tenantId: user.tenantId.toString(),
    roleId: user.roleId.toString(),
    tokenVersion: user.tokenVersion
  };

  const newAccessToken = generateAccessToken(tokenPayload);
  const newRefreshToken = generateRefreshToken(tokenPayload);

  user.refreshToken = newRefreshToken;
  await user.save();

  return sendSuccess(res, 200, 'Token refreshed successfully', {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  
  if (userId) {
    await User.findByIdAndUpdate(userId, { refreshToken: null }).setOptions({ skipTenantPlugin: true });
  }

  return sendSuccess(res, 200, 'Logged out successfully', null);
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  
  if (!userId) {
    throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
  }

  const user = await User.findById(userId)
    .populate('roleId')
    .setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  return sendSuccess(res, 200, 'User profile retrieved successfully', { user });
});
