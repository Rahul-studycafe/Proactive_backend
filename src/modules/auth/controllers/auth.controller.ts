import { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/async-handler';
import { ApiError } from '../../../common/errors/api-error';
import { sendSuccess } from '../../../common/responses/api-response';
import { Organization, User, PlatformUser } from '../schemas';
import { Role } from '../../roles/schemas/index';
import { BillingEntity } from '../../masters/schemas/index';
import { TenantSettings } from '../../masters/schemas/index';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, generateResetToken, verifyResetToken } from '../services/auth.service';
import Razorpay from 'razorpay';
import z from 'zod';
import { calculateSubscriptionPrice } from '../../../utils/pricing';
import { Otp } from '../../../models/Otp';
import { EmailChangeRequest } from '../../../models/EmailChangeRequest';
import { sendOtpEmail, sendPasswordResetEmail, sendEmailChangeOtpEmail } from '../services/email.service';
import crypto from 'crypto';
import { PricingTier } from '../../../models/PricingTier';
import { PermissionResolverService } from '../../../services/permission-resolver.service';
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
    const normalizedEmail = email.toLowerCase();
    const existingPlatformUser = await PlatformUser.findOne({ email: normalizedEmail });
    if (existingPlatformUser && existingPlatformUser.status === 'active') {
      throw new ApiError(409, 'A practice owner with this email already exists', 'USER_EXISTS');
    }

    // Verify that the email was verified using OTP
    const verifiedOtp = await Otp.findOne({ email: normalizedEmail, isVerified: true });
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
  
  // Check if platform user already exists before sending OTP
  const existingPlatformUser = await PlatformUser.findOne({ email: normalizedEmail });
  if (existingPlatformUser && existingPlatformUser.status === 'active') {
    throw new ApiError(409, 'A practice owner with this email already exists', 'USER_EXISTS');
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
  const normalizedEmail = email.toLowerCase();

  // 1. First Priority: Platform User (Practice Owner / Super Admin)
  const platformUser = await PlatformUser.findOne({ email: normalizedEmail }).select('+password');
  if (platformUser) {
    const isMatch = await platformUser.comparePassword(password);
    if (!isMatch) {
      throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (platformUser.status !== 'active') {
      throw new ApiError(403, 'Account is deactivated', 'ACCOUNT_DEACTIVATED');
    }

    let org = await Organization.findOne({ ownerId: platformUser._id });
    if (!org) {
      // Defensive fallback in case ownerId was stored as a raw string
      const rawOrg = await Organization.collection.findOne({
        $or: [
          { ownerId: platformUser._id },
          { ownerId: platformUser._id.toString() }
        ]
      });
      if (rawOrg) {
        org = await Organization.findById(rawOrg._id);
      }
    }

    if (!org) {
      throw new ApiError(404, 'Organization not found for platform user', 'ORG_NOT_FOUND');
    }

    let tenantUser = await User.findOne({ tenantId: org._id, isOwner: true })
      .populate('roleId')
      .setOptions({ skipTenantPlugin: true });

    if (!tenantUser) {
      // Defensive fallback in case tenantId was stored as a raw string
      const rawUser = await User.collection.findOne({
        $or: [
          { tenantId: org._id, isOwner: true },
          { tenantId: org._id.toString(), isOwner: true }
        ]
      });
      if (rawUser) {
        tenantUser = await User.findById(rawUser._id)
          .populate('roleId')
          .setOptions({ skipTenantPlugin: true });
      }
    }

    if (!tenantUser) {
      throw new ApiError(404, 'Owner workspace profile not found', 'USER_NOT_FOUND');
    }

    const roleIdString = (tenantUser.roleId as any)?._id
      ? (tenantUser.roleId as any)._id.toString()
      : tenantUser.roleId.toString();

    const tokenPayload = {
      userId: tenantUser._id.toString(),
      platformUserId: platformUser._id.toString(),
      tenantId: org._id.toString(),
      roleId: roleIdString,
      tokenVersion: platformUser.tokenVersion,
      isOwner: true
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    platformUser.refreshToken = refreshToken;
    platformUser.lastLoginAt = new Date();
    await platformUser.save();

    tenantUser.refreshToken = refreshToken;
    await tenantUser.save();

    return sendSuccess(res, 200, 'Login successful', {
      accessToken,
      refreshToken,
      user: {
        _id: tenantUser._id,
        name: tenantUser.name,
        username: tenantUser.username,
        email: platformUser.email,
        roleId: tenantUser.roleId,
        isOwner: true,
        userType: 'PlatformUser'
      },
      organization: {
        _id: org._id,
        name: org.name,
        slug: org.slug,
        subscriptionStatus: org.subscriptionStatus
      }
    });
  }

  // 2. Second Priority: Tenant User (Staff Member / Accountant)
  const tenantUser = await User.findOne({ email: normalizedEmail })
    .populate('roleId')
    .select('+password')
    .setOptions({ skipTenantPlugin: true });

  if (!tenantUser) {
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (tenantUser.invitationStatus === 'invited' && !tenantUser.password) {
    throw new ApiError(403, 'Please activate your account using the invitation email sent to you.', 'INVITATION_PENDING');
  }

  const isMatch = await tenantUser.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (!tenantUser.isActive) {
    throw new ApiError(403, 'Account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  const org = await Organization.findById(tenantUser.tenantId);
  if (!org) {
    throw new ApiError(401, 'Organization not found for user', 'INVALID_CREDENTIALS');
  }

  const roleIdString = (tenantUser.roleId as any)?._id
    ? (tenantUser.roleId as any)._id.toString()
    : tenantUser.roleId.toString();

  const tokenPayload = {
    userId: tenantUser._id.toString(),
    tenantId: org._id.toString(),
    roleId: roleIdString,
    tokenVersion: tenantUser.tokenVersion,
    isOwner: tenantUser.isOwner || false
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  tenantUser.refreshToken = refreshToken;
  await tenantUser.save();

  return sendSuccess(res, 200, 'Login successful', {
    accessToken,
    refreshToken,
    user: {
      _id: tenantUser._id,
      name: tenantUser.name,
      username: tenantUser.username,
      email: tenantUser.email,
      roleId: tenantUser.roleId,
      isOwner: tenantUser.isOwner || false,
      userType: 'TenantUser'
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
    .populate('roleIds')
    .populate('tenantId')
    .setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const tenantIdStr =
    (user.tenantId as any)?._id?.toString() ||
    (user.tenantId as any)?.toString() ||
    req.tenantId?.toString() ||
    '';

  const effectiveState = await PermissionResolverService.resolveUserPermissions(
    user._id.toString(),
    tenantIdStr
  );

  const tenantOrg = user.tenantId as any;
  const isSuperAdmin = Boolean(user.isOwner || effectiveState.isSuperAdmin);
  const workspaceRenamedCount = tenantOrg?.workspaceRenamedCount || 0;
  const canRenameWorkspace = isSuperAdmin && workspaceRenamedCount < 1;

  return sendSuccess(res, 200, 'User profile retrieved successfully', {
    user: {
      ...user.toObject(),
      isSuperAdmin,
      effectivePermissions: effectiveState.permissions,
      roles: effectiveState.roles,
      canRenameWorkspace,
      workspaceRenamedCount
    }
  });
});

export const uploadAvatar = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  
  if (!userId) {
    throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
  }

  if (!req.file) {
    throw new ApiError(400, 'No file uploaded', 'FILE_REQUIRED');
  }

  // Generate URL for the uploaded file
  const photoUrl = `/public/uploads/avatars/${req.file.filename}`;

  const user = await User.findByIdAndUpdate(
    userId,
    { photoUrl },
    { new: true }
  ).setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.platformUserId) {
    await PlatformUser.findByIdAndUpdate(user.platformUserId, { photoUrl });
  }

  return sendSuccess(res, 200, 'Avatar uploaded successfully', { photoUrl });
});

export const deleteAvatar = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { photoUrl: '' },
    { new: true }
  ).setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.platformUserId) {
    await PlatformUser.findByIdAndUpdate(user.platformUserId, { photoUrl: '' });
  }

  return sendSuccess(res, 200, 'Avatar removed successfully', { photoUrl: '' });
});

const updateMeSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  location: z.string().optional(),
  bio: z.string().optional(),
  email: z.string().email('Invalid email address').optional(),
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
  }

  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const user = await User.findById(userId)
    .populate('roleId')
    .populate('roleIds')
    .populate('tenantId')
    .setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const { name, phone, mobile, location, bio, email } = parsed.data;

  if (name !== undefined) {
    user.name = name.trim();
  }

  const phoneVal = phone !== undefined ? phone.trim() : (mobile !== undefined ? mobile.trim() : undefined);
  if (phoneVal !== undefined) {
    user.phone = phoneVal;
    user.mobile = phoneVal;
  }

  if (location !== undefined) {
    user.location = location.trim();
  }

  if (bio !== undefined) {
    user.bio = bio.trim();
  }

  if (email !== undefined && email.trim().toLowerCase() !== user.email) {
    const tenantIdStr =
      (user.tenantId as any)?._id?.toString() ||
      (user.tenantId as any)?.toString() ||
      req.tenantId?.toString() ||
      '';
    const effectiveState = await PermissionResolverService.resolveUserPermissions(
      user._id.toString(),
      tenantIdStr
    );
    const isSuperAdmin = Boolean(user.isOwner || effectiveState.isSuperAdmin);

    if (isSuperAdmin) {
      throw new ApiError(
        400,
        'Super Admin email address cannot be directly updated. Please use the dual-email verification code process.',
        'VERIFICATION_REQUIRED'
      );
    } else {
      throw new ApiError(
        403,
        'Email address cannot be changed once added.',
        'EMAIL_IMMUTABLE'
      );
    }
  }

  await user.save();

  if (user.platformUserId) {
    const platformUser = await PlatformUser.findById(user.platformUserId);
    if (platformUser) {
      if (name !== undefined) platformUser.name = name.trim();
      if (phoneVal !== undefined) {
        platformUser.mobile = phoneVal;
        platformUser.phone = phoneVal;
      }
      if (location !== undefined) platformUser.location = location.trim();
      if (bio !== undefined) platformUser.bio = bio.trim();
      if (user.email && user.email !== platformUser.email) {
        platformUser.email = user.email;
      }
      await platformUser.save();
    }
  }

  const tenantIdStr =
    (user.tenantId as any)?._id?.toString() ||
    (user.tenantId as any)?.toString() ||
    req.tenantId?.toString() ||
    '';

  const effectiveState = await PermissionResolverService.resolveUserPermissions(
    user._id.toString(),
    tenantIdStr
  );

  const tenantOrg = user.tenantId as any;
  const isSuperAdmin = Boolean(user.isOwner || effectiveState.isSuperAdmin);
  const workspaceRenamedCount = tenantOrg?.workspaceRenamedCount || 0;
  const canRenameWorkspace = isSuperAdmin && workspaceRenamedCount < 1;

  return sendSuccess(res, 200, 'Profile updated successfully', {
    user: {
      ...user.toObject(),
      isSuperAdmin,
      effectivePermissions: effectiveState.permissions,
      roles: effectiveState.roles,
      canRenameWorkspace,
      workspaceRenamedCount
    }
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
  }

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await User.findById(userId)
    .select('+password')
    .setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  let verified = false;

  if (user.platformUserId) {
    const platformUser = await PlatformUser.findById(user.platformUserId).select('+password');
    if (platformUser) {
      verified = await platformUser.comparePassword(currentPassword);
      if (!verified && user.password) {
        verified = await user.comparePassword(currentPassword);
      }
      if (verified) {
        platformUser.password = newPassword;
        await platformUser.save();
      }
    }
  } else if (user.password) {
    verified = await user.comparePassword(currentPassword);
  }

  if (!verified) {
    throw new ApiError(400, 'Current password is incorrect', 'INVALID_PASSWORD');
  }

  user.password = newPassword;
  await user.save();

  return sendSuccess(res, 200, 'Password updated successfully', null);
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

const verifyInviteSchema = z.object({
  token: z.string().min(1, 'Token is required')
});

export const verifyInvite = asyncHandler(async (req: Request, res: Response) => {
  const parsed = verifyInviteSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid invitation token', 'VALIDATION_FAILED');
  }

  const { token } = parsed.data;
  const user = await User.findOne({
    invitationToken: token,
    invitationStatus: 'invited'
  }).setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(400, 'Invalid or expired invitation link', 'INVALID_INVITE_TOKEN');
  }

  if (user.invitationExpiresAt && user.invitationExpiresAt < new Date()) {
    throw new ApiError(400, 'Invitation link has expired. Please ask your administrator to resend the invite.', 'INVITE_EXPIRED');
  }

  const org = await Organization.findById(user.tenantId);

  return sendSuccess(res, 200, 'Invitation verified', {
    name: user.name,
    email: user.email,
    username: user.username,
    organizationName: org?.name || 'Your Practice'
  });
});

const activateInviteSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export const activateInvite = asyncHandler(async (req: Request, res: Response) => {
  const parsed = activateInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const { token, password } = parsed.data;
  const user = await User.findOne({
    invitationToken: token,
    invitationStatus: 'invited'
  }).setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(400, 'Invalid or expired invitation link', 'INVALID_INVITE_TOKEN');
  }

  if (user.invitationExpiresAt && user.invitationExpiresAt < new Date()) {
    throw new ApiError(400, 'Invitation link has expired', 'INVITE_EXPIRED');
  }

  user.password = password; // pre-save will hash with bcrypt
  user.invitationStatus = 'active';
  user.invitationToken = undefined;
  user.invitationExpiresAt = undefined;
  user.isActive = true;
  await user.save();

  return sendSuccess(res, 200, 'Account activated successfully! You can now log in.', null);
});

const requestEmailChangeSchema = z.object({
  newEmail: z.string().email('Valid email address is required'),
});

export const requestEmailChange = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
  }

  const parsed = requestEmailChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const user = await User.findById(userId)
    .populate('tenantId')
    .setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const tenantIdStr =
    (user.tenantId as any)?._id?.toString() ||
    (user.tenantId as any)?.toString() ||
    req.tenantId?.toString() ||
    '';

  const effectiveState = await PermissionResolverService.resolveUserPermissions(
    user._id.toString(),
    tenantIdStr
  );

  const isSuperAdmin = Boolean(user.isOwner || effectiveState.isSuperAdmin);
  if (!isSuperAdmin) {
    throw new ApiError(
      403,
      'Only the Super Admin can change their email address. Staff email addresses cannot be modified.',
      'FORBIDDEN'
    );
  }

  const currentEmail = (user.email || '').toLowerCase().trim();
  const newEmail = parsed.data.newEmail.toLowerCase().trim();

  if (currentEmail === newEmail) {
    throw new ApiError(400, 'New email address must be different from current email', 'SAME_EMAIL');
  }

  // Check if new email is already used by any platform user or tenant user
  const existingPlatformUser = await PlatformUser.findOne({ email: newEmail });
  if (existingPlatformUser && existingPlatformUser._id.toString() !== user.platformUserId?.toString()) {
    throw new ApiError(409, 'This email address is already registered in the system', 'EMAIL_TAKEN');
  }

  const existingTenantUser = await User.findOne({ email: newEmail });
  if (existingTenantUser && existingTenantUser._id.toString() !== user._id.toString()) {
    throw new ApiError(409, 'This email address is already in use by another user', 'EMAIL_TAKEN');
  }

  // Generate two distinct 6-digit verification codes
  const currentEmailOtp = Math.floor(100000 + Math.random() * 900000).toString();
  const newEmailOtp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Clear previous pending requests for this user
  await EmailChangeRequest.deleteMany({ userId: user._id });

  // Store new request
  await EmailChangeRequest.create({
    userId: user._id,
    currentEmail,
    newEmail,
    currentEmailOtp,
    newEmailOtp,
    expiresAt,
  });

  // Send verification code to current email
  try {
    await sendEmailChangeOtpEmail(currentEmail, currentEmailOtp, 'current', newEmail);
  } catch (err) {
    console.error('[Email Change] Failed to send OTP to current email:', err);
    throw new ApiError(500, 'Failed to send verification code to current email address. Please try again.', 'EMAIL_SEND_FAILED');
  }

  // Send verification code to new email
  try {
    await sendEmailChangeOtpEmail(newEmail, newEmailOtp, 'new', currentEmail);
  } catch (err) {
    console.error('[Email Change] Failed to send OTP to new email:', err);
    throw new ApiError(500, 'Failed to send verification code to new email address. Please verify the address and try again.', 'EMAIL_SEND_FAILED');
  }

  return sendSuccess(res, 200, 'Verification codes sent to both email addresses', {
    currentEmail,
    newEmail,
    expiresInSeconds: 600
  });
});

const verifyEmailChangeSchema = z.object({
  newEmail: z.string().email('Valid email address is required'),
  currentEmailOtp: z.string().min(4, 'Current email verification code is required'),
  newEmailOtp: z.string().min(4, 'New email verification code is required'),
});

export const verifyEmailChange = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
  }

  const parsed = verifyEmailChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const user = await User.findById(userId)
    .populate('tenantId')
    .setOptions({ skipTenantPlugin: true });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const tenantIdStr =
    (user.tenantId as any)?._id?.toString() ||
    (user.tenantId as any)?.toString() ||
    req.tenantId?.toString() ||
    '';

  const effectiveState = await PermissionResolverService.resolveUserPermissions(
    user._id.toString(),
    tenantIdStr
  );

  const isSuperAdmin = Boolean(user.isOwner || effectiveState.isSuperAdmin);
  if (!isSuperAdmin) {
    throw new ApiError(
      403,
      'Only the Super Admin can change their email address.',
      'FORBIDDEN'
    );
  }

  const { newEmail, currentEmailOtp, newEmailOtp } = parsed.data;
  const normalizedNewEmail = newEmail.toLowerCase().trim();

  // Find active change request
  const request = await EmailChangeRequest.findOne({
    userId: user._id,
    newEmail: normalizedNewEmail,
  });

  if (!request) {
    throw new ApiError(
      400,
      'No pending email change request found for this address. Please request a new verification code.',
      'REQUEST_NOT_FOUND'
    );
  }

  if (request.expiresAt < new Date()) {
    await EmailChangeRequest.deleteOne({ _id: request._id });
    throw new ApiError(
      400,
      'Verification codes have expired. Please request new verification codes.',
      'VERIFICATION_EXPIRED'
    );
  }

  // Validate OTP for current email
  if (request.currentEmailOtp.trim() !== currentEmailOtp.trim()) {
    throw new ApiError(
      400,
      'Invalid verification code for your current email address. Please check your inbox and try again.',
      'INVALID_CURRENT_OTP'
    );
  }

  // Validate OTP for new email
  if (request.newEmailOtp.trim() !== newEmailOtp.trim()) {
    throw new ApiError(
      400,
      'Invalid verification code for your new email address. Please check your new inbox and try again.',
      'INVALID_NEW_OTP'
    );
  }

  // Re-verify uniqueness
  const existingPlatformUser = await PlatformUser.findOne({ email: normalizedNewEmail });
  if (existingPlatformUser && existingPlatformUser._id.toString() !== user.platformUserId?.toString()) {
    throw new ApiError(409, 'This email address is already registered in the system', 'EMAIL_TAKEN');
  }

  const existingTenantUser = await User.findOne({ email: normalizedNewEmail });
  if (existingTenantUser && existingTenantUser._id.toString() !== user._id.toString()) {
    throw new ApiError(409, 'This email address is already in use by another user', 'EMAIL_TAKEN');
  }

  // Update user email
  user.email = normalizedNewEmail;
  await user.save();

  // Update platform user email if applicable
  if (user.platformUserId) {
    await PlatformUser.findByIdAndUpdate(user.platformUserId, { email: normalizedNewEmail });
  }

  // Cleanup change requests
  await EmailChangeRequest.deleteMany({ userId: user._id });

  return sendSuccess(res, 200, 'Super Admin email address successfully verified and updated', {
    email: user.email,
  });
});
