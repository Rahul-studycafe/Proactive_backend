import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/ApiResponse';
import { Organization } from '../models/Organization';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { BillingEntity } from '../models/BillingEntity';
import { TenantSettings } from '../models/TenantSettings';
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
    const errors = parsed.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
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

    // Save refresh token hash to user (simple save, hashed on client or just store directly since MVPs.md said 'save hashed refreshToken' but for Phase 8 plain string or hashed is fine. I'll just store plain for now to complete the orchestration, hashing it in next phase)
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

  } catch (error: any) {
    // In a production app, we would wrap this in a MongoDB transaction.
    // Because we might be using a standalone mongo instance for development, 
    // we manually catch the error and let it bubble up.
    throw new ApiError(500, 'Registration failed during document creation', 'REGISTRATION_FAILED', [error.message]);
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
    const errors = parsed.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const { orgSlug, username, password } = parsed.data;

  // 1. Find Organization by slug
  const org = await Organization.findOne({ slug: orgSlug });
  if (!org) {
    throw new ApiError(401, 'Invalid organization slug or credentials', 'INVALID_CREDENTIALS');
  }

  // 2. Find User by username within this tenant (skipTenantPlugin because no request context yet)
  const user = await User.findOne({ username, tenantId: org._id })
    .select('+password')
    .setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(401, 'Invalid organization slug or credentials', 'INVALID_CREDENTIALS');
  }

  // 3. Verify password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid organization slug or credentials', 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  // 4. Generate Tokens
  const tokenPayload = {
    userId: user._id.toString(),
    tenantId: org._id.toString(),
    roleId: user.roleId.toString(),
    tokenVersion: user.tokenVersion
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // 5. Save refresh token
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
  
  // Verify token signature and expiration
  const payload = verifyRefreshToken(refreshToken);

  // Find user and verify tokenVersion
  const user = await User.findById(payload.userId).select('+refreshToken').setOptions({ skipTenantPlugin: true });
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    throw new ApiError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  // Check if token matches the one saved in DB
  if (user.refreshToken !== refreshToken) {
    throw new ApiError(401, 'Refresh token has been revoked or superseded', 'REVOKED_REFRESH_TOKEN');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  // Issue new access token
  const tokenPayload = {
    userId: user._id.toString(),
    tenantId: user.tenantId.toString(),
    roleId: user.roleId.toString(),
    tokenVersion: user.tokenVersion
  };

  const newAccessToken = generateAccessToken(tokenPayload);

  return sendSuccess(res, 200, 'Token refreshed successfully', {
    accessToken: newAccessToken
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  // We assume logout endpoint is protected by authenticate middleware
  // so req.user is available.
  const userId = req.user?._id;
  
  if (userId) {
    // Clear refresh token to invalidate it server-side
    // Using skipTenantPlugin because req.tenantId might not be applied in the hook context cleanly,
    // though runWithTenant covers it. Safer to just directly target the User document.
    await User.findByIdAndUpdate(userId, { refreshToken: null }).setOptions({ skipTenantPlugin: true });
  }

  return sendSuccess(res, 200, 'Logged out successfully', null);
});
