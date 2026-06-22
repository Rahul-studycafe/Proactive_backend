import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/async-handler';
import { ApiError } from '../../../common/errors/api-error';
import { sendSuccess } from '../../../common/responses/api-response';
import { Organization } from '../schemas';
import { User } from '../schemas';
import { Role } from '../../roles/schemas/index';
import { BillingEntity } from '../../masters/schemas/index';
import { TenantSettings } from '../../masters/schemas/index';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, generateResetToken, verifyResetToken } from '../services/auth.service';
import Razorpay from 'razorpay';
import z from 'zod';
import { calculateSubscriptionPrice } from '../../../utils/pricing';
import { Otp } from '../../../models/Otp';
import { sendOtpEmail, sendPasswordResetEmail } from '../services/email.service';
import crypto from 'crypto';
import { PricingTier } from '../../../models/PricingTier';
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

    // Verify that the email was verified using OTP
    const verifiedOtp = await Otp.findOne({ email: email.toLowerCase(), isVerified: true });
    if (!verifiedOtp) {
      throw new ApiError(400, 'Email is not verified. Please verify your email with OTP.', 'EMAIL_NOT_VERIFIED');
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

  // Save the intent so the webhook can process it if the browser closes
  const { PendingRegistration } = require('../../../models/PendingRegistration');
  await PendingRegistration.create({
    orderId: order.id,
    orgName: parsed.data.orgName,
    name: parsed.data.name,
    username: parsed.data.username,
    password: parsed.data.password,
    email: email,
    mobile: parsed.data.mobile || '',
    usersCount: usersCount,
    promoCode: promoCode || ''
  });

  return sendSuccess(res, 201, 'Registration order created', {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency
  });
});

const emailSchema = z.object({
  email: z.string().email(),
});

export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  const parsed = emailSchema.safeParse(req.body);

  console.log("function called")
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid email format', 'VALIDATION_FAILED');
  }
  
  const { email } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  
  // Check if user already exists before sending OTP
  const existingUser = await User.findOne({ email: normalizedEmail }).setOptions({ skipTenantPlugin: true });
  if (existingUser) {
    const org = await Organization.findById(existingUser.tenantId);
    // If the org is active (or anything other than pending_payment), we reject the OTP request
    if (org && org.subscriptionStatus !== 'pending_payment') {
      throw new ApiError(409, 'User with this email already exists', 'USER_EXISTS');
    }
  }

  // Generate 6 digit OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  
  // 10 minutes expiration
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  
  try {
    console.log(`[OTP Debug] Attempting to clear old OTPs for ${normalizedEmail}...`);
    // Invalidate any previous OTPs for this email by simply overriding or deleting
    await Otp.deleteMany({ email: normalizedEmail });

    console.log(`[OTP Debug] Attempting to create new OTP in database...`);
    // Create new OTP record
    await Otp.create({
      email: normalizedEmail,
      otp: otpCode,
      isVerified: false,
      expiresAt,
    });

    console.log(`[OTP Debug] Attempting to send email via nodemailer...`);
    // Send email
    await sendOtpEmail(normalizedEmail, otpCode);
    console.log(`[OTP Debug] Email sent successfully!`);
  } catch (error) {
    console.error('[OTP Debug] Error occurred:', error);
    throw new ApiError(500, 'Failed to process OTP request. Check server logs.', 'OTP_FAILED');
  }

  return sendSuccess(res, 200, 'OTP sent successfully', null);
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid input', 'VALIDATION_FAILED');
  }

  const { email, otp } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existingOtp = await Otp.findOne({ email: normalizedEmail });

  if (!existingOtp) {
    throw new ApiError(400, 'No OTP request found for this email', 'OTP_NOT_FOUND');
  }

  if (existingOtp.expiresAt < new Date()) {
    throw new ApiError(400, 'OTP has expired. Please request a new one.', 'OTP_EXPIRED');
  }

  if (existingOtp.otp !== otp) {
    throw new ApiError(400, 'Invalid OTP', 'INVALID_OTP');
  }

  // Mark as verified
  existingOtp.isVerified = true;
  await existingOtp.save();

  return sendSuccess(res, 200, 'Email verified successfully', null);
});

export const calculatePriceEndpoint = asyncHandler(async (req: Request, res: Response) => {
  const users = parseInt(req.query.users as string) || 5;
  const promoCode = req.query.promo as string | undefined;

  const pricingData = await calculateSubscriptionPrice(users, promoCode);

  return sendSuccess(res, 200, 'Price calculated', pricingData);
});

export const getPricingTiersEndpoint = asyncHandler(async (req: Request, res: Response) => {
  const tiers = await PricingTier.find({ isActive: true }).sort({ minUsers: 1 });
  return sendSuccess(res, 200, 'Pricing tiers retrieved', tiers);
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const { email, password } = parsed.data;

  // 1. Find user by email (globally unique)
  const user = await User.findOne({ email })
    .populate('roleId')
    .select('+password')
    .setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // 2. Load their organization to get token payload values
  const org = await Organization.findById(user.tenantId);
  if (!org) {
    throw new ApiError(401, 'Organization not found for user', 'INVALID_CREDENTIALS');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
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

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    throw new ApiError(400, 'Email is required', 'EMAIL_REQUIRED');
  }

  const user = await User.findOne({ email }).setOptions({ skipTenantPlugin: true });
  if (!user) {
    // We don't throw an error to prevent email enumeration, but we return a success response
    return sendSuccess(res, 200, 'If an account exists with this email, a reset link has been sent.', null);
  }

  const resetToken = generateResetToken(email);
  const frontendAppUrl = process.env.FRONTEND_APP_URL;

  if (!frontendAppUrl) {
    throw new ApiError(500, 'Frontend application URL is not configured', 'SERVER_CONFIG_ERROR');
  }

  const resetLink = `${frontendAppUrl}/reset-password?token=${resetToken}`;
  
  try {
    await sendPasswordResetEmail(email, resetLink);
  } catch (error) {
    // Log the error for debugging but still return a generic message to the client
    console.error('Failed to send reset email:', error);
    // Return a generic message so the user doesn't get specific error info
    return sendSuccess(res, 200, 'If an account exists with this email, a reset link has been sent.', null);
  }

  return sendSuccess(res, 200, 'If an account exists with this email, a reset link has been sent.', null);
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    throw new ApiError(400, 'Token and new password are required', 'MISSING_FIELDS');
  }

  if (newPassword.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters', 'PASSWORD_TOO_SHORT');
  }

  const { email } = verifyResetToken(token);

  const user = await User.findOne({ email }).setOptions({ skipTenantPlugin: true });
  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  user.password = newPassword;
  await user.save();

  return sendSuccess(res, 200, 'Password has been reset successfully', null);
});
