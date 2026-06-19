import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/ApiResponse';
import { PricingTier } from '../models/PricingTier';
import { Organization } from '../models/Organization';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { BillingEntity } from '../models/BillingEntity';
import { TenantSettings } from '../models/TenantSettings';
import { sendWelcomeEmail } from '../services/email.service';
import { generateAccessToken, generateRefreshToken } from '../services/auth.service';
import Razorpay from 'razorpay';
import crypto from 'crypto';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

export const getPricing = asyncHandler(async (req: Request, res: Response) => {
  const tiers = await PricingTier.find({ isActive: true }).sort({ minUsers: 1 });
  return sendSuccess(res, 200, 'Pricing tiers fetched', tiers);
});

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const { usersCount } = req.body;
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
  }

  if (!usersCount || usersCount < 1) {
    throw new ApiError(400, 'Valid users count is required', 'VALIDATION_FAILED');
  }

  const organization = await Organization.findById(tenantId);
  if (!organization) {
    throw new ApiError(404, 'Organization not found', 'NOT_FOUND');
  }

  // Find appropriate pricing tier
  const tier = await PricingTier.findOne({
    minUsers: { $lte: usersCount },
    maxUsers: { $gte: usersCount },
    isActive: true
  });

  if (!tier) {
    throw new ApiError(400, 'No pricing tier found for this number of users', 'NO_TIER_FOUND');
  }

  // Calculate total amount in paise (Razorpay uses smallest currency unit)
  // For yearly subscription
  const amountInRupees = tier.pricePerUserYearly * usersCount;
  const amountInPaise = amountInRupees * 100;

  const options = {
    amount: amountInPaise,
    currency: 'INR',
    receipt: `receipt_org_${tenantId}`,
    notes: {
      tenantId: tenantId.toString(),
      usersCount,
      tierName: tier.name
    }
  };

  const order = await razorpay.orders.create(options);

  return sendSuccess(res, 200, 'Order created successfully', {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    usersCount,
    tierDetails: {
      name: tier.name,
      pricePerUserYearly: tier.pricePerUserYearly
    }
  });
});

export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orgName, name, username, password, email, mobile } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new ApiError(400, 'Payment details missing', 'VALIDATION_FAILED');
  }

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
    .update(body.toString())
    .digest('hex');

  const isAuthentic = expectedSignature === razorpay_signature;

  if (!isAuthentic) {
    throw new ApiError(400, 'Invalid payment signature', 'PAYMENT_FAILED');
  }

  // Fetch the order from Razorpay to securely get notes
  const order = await razorpay.orders.fetch(razorpay_order_id);
  const usersCount = Number(order.notes?.usersCount) || 5;

  // Now that payment is verified, we can safely create all the records in the database!

  // Generate a unique slug for the organization
  let baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  let slug = baseSlug;
  let counter = 1;
  while (await Organization.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  // Calculate renewal date (1 year from now)
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  // 1. Create Organization
  const organization = new Organization({
    name: orgName,
    slug,
    plan: {
      maxUsers: usersCount
    },
    subscriptionStatus: 'active',
    renewalDate: nextYear
  });
  await organization.save();

  // 2. Create Super Admin Role
  const superAdminRole = new Role({
    tenantId: organization._id,
    name: 'Super Admin',
    description: 'System generated super admin role',
    isSuperAdmin: true,
    permissions: {}
  });
  await superAdminRole.save();

  // 3. Create User
  const userRecord = new User({
    tenantId: organization._id,
    name,
    username,
    password, // hashed by pre-save hook
    email,
    mobile,
    roleId: superAdminRole._id,
    tokenVersion: 1
  });
  await userRecord.save();

  // 4. Create Default BillingEntity
  const billing = new BillingEntity({
    tenantId: organization._id,
    name: orgName,
    invoicePrefix: 'INV-',
    receiptPrefix: 'RCT-'
  });
  await billing.save();

  // 5. Create TenantSettings
  const settings = new TenantSettings({
    tenantId: organization._id,
    clientCustomFields: [],
    allowDuplicateClientNames: false,
    defaultGstPercentage: 18
  });
  await settings.save();

  // Generate tokens
  const tokenPayload = {
    userId: userRecord._id.toString(),
    tenantId: organization._id.toString(),
    roleId: superAdminRole._id.toString(),
    tokenVersion: userRecord.tokenVersion
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  userRecord.refreshToken = refreshToken;
  await userRecord.save();

  // Send email asynchronously
  if (userRecord.email) {
    sendWelcomeEmail(userRecord.email, userRecord.name, organization.name).catch(console.error);
  }

  return sendSuccess(res, 200, 'Payment verified successfully. You are now logged in.', {
    accessToken,
    refreshToken,
    user: {
      _id: userRecord._id,
      name: userRecord.name,
      username: userRecord.username,
      role: 'Super Admin'
    },
    organization: {
      _id: organization._id,
      name: organization.name,
      slug: organization.slug,
      subscriptionStatus: organization.subscriptionStatus
    }
  });
});
