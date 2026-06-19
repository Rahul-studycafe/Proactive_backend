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
import Razorpay from 'razorpay';
import z from 'zod';
import { calculateSubscriptionPrice } from '../../../utils/pricing';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

const registerSchema = z.object({
  orgName: z.string().min(2),
  name: z.string().min(2),
  username: z.string().min(4),
  password: z.string().min(6),
  email: z.string().email().optional(),
  mobile: z.string().optional(),
  usersCount: z.number().min(1).default(5),
  promoCode: z.string().optional()
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  // Validate request body
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const { usersCount, email, promoCode } = parsed.data;

  // Clean up any old pending_payment garbage from previous tests
  if (email) {
    const existingUser = await User.findOne({ email }).setOptions({ skipTenantPlugin: true });
    if (existingUser) {
      const org = await Organization.findById(existingUser.tenantId);
      if (org && org.subscriptionStatus === 'pending_payment') {
        // Delete the stale test records to allow a fresh start
        await User.deleteOne({ _id: existingUser._id });
        await Organization.deleteOne({ _id: org._id });
        await Role.deleteMany({ tenantId: org._id });
        await BillingEntity.deleteMany({ tenantId: org._id });
        await TenantSettings.deleteMany({ tenantId: org._id });
      } else {
        throw new ApiError(409, 'User with this email already exists and is active', 'USER_EXISTS');
      }
    }
  }

  // Calculate standard price using SSOT
  const pricingData = await calculateSubscriptionPrice(usersCount, promoCode);
  const amountInPaise = pricingData.grandTotal * 100;
  
  // Create Razorpay Order
  const options = {
    amount: amountInPaise,
    currency: 'INR',
    receipt: `receipt_temp_${Date.now()}`,
    notes: {
      usersCount: usersCount.toString()
    }
  };
  const order = await razorpay.orders.create(options);

  return sendSuccess(res, 201, 'Registration order created', {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency
  });
});

export const calculatePriceEndpoint = asyncHandler(async (req: Request, res: Response) => {
  const users = parseInt(req.query.users as string) || 5;
  const promoCode = req.query.promo as string | undefined;

  const pricingData = await calculateSubscriptionPrice(users, promoCode);

  return sendSuccess(res, 200, 'Price calculated', pricingData);
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
      slug: org.slug,
      subscriptionStatus: org.subscriptionStatus
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
