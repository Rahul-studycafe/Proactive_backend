import { Request, Response } from 'express';
import { z } from 'zod';
import { ClientUser } from '../models/ClientUser';
import { Client } from '../modules/clients/schemas/client.schema';
import { Organization } from '../modules/auth/schemas';
import { TenantWebsiteSettings } from '../models/TenantWebsiteSettings';
import { ApiError } from '../common/errors/api-error';
import { sendSuccess } from '../common/responses/api-response';
import { asyncHandler } from '../utils/async-handler';
import {
  generateClientToken,
  generateOtp,
  generateMagicLinkToken,
  generateSelectionToken,
  verifySelectionToken
} from '../services/client-auth.service';
import {
  sendMagicLinkEmail,
  sendPortalOtpEmail
} from '../modules/auth/services/email.service';

/**
 * Format practice workspace descriptor for multi-firm clients
 */
const formatFirmWorkspace = async (user: any, client: any) => {
  const org = await Organization.findById(user.tenantId);
  const websiteSettings = await TenantWebsiteSettings.findOne({ tenantId: user.tenantId });
  return {
    clientUserId: user._id.toString(),
    clientId: client._id.toString(),
    tenantId: user.tenantId.toString(),
    firmName: org?.name || websiteSettings?.branding?.firmName || 'Practice Office',
    firmLogo: websiteSettings?.branding?.logoUrl || '',
    brandColor: websiteSettings?.branding?.brandColor || '#2563eb',
    clientName: client.name,
    clientNumber: client.clientNumber || client.fileNo,
    entityType: client.entityType,
    pan: client.pan,
    isPrimaryContact: user.isPrimaryContact
  };
};

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

  // Find all active client accounts matching email or phone
  const users = await ClientUser.find({
    $or: [
      { email: identifier },
      { phone: emailOrPhone.trim() }
    ],
    isActive: true
  })
    .select('+password')
    .setOptions({ skipTenantPlugin: true });

  if (!users || users.length === 0) {
    throw new ApiError(401, 'Invalid email/phone or password', 'INVALID_CREDENTIALS');
  }

  // Filter candidates where password matches AND client is active and allows login
  const matchingAccounts: { user: any; client: any }[] = [];
  for (const candidate of users) {
    const isMatch = await candidate.comparePassword(password);
    if (!isMatch) continue;

    const parentClient = await Client.findById(candidate.clientId).setOptions({ skipTenantPlugin: true });
    if (parentClient && parentClient.isActive && parentClient.allowLogin) {
      matchingAccounts.push({ user: candidate, client: parentClient });
    }
  }

  if (matchingAccounts.length === 0) {
    throw new ApiError(401, 'Invalid email/phone or password', 'INVALID_CREDENTIALS');
  }

  // Single firm workspace: issue session token directly
  if (matchingAccounts.length === 1) {
    const { user, client } = matchingAccounts[0];
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
        clientNumber: client.clientNumber || client.fileNo,
        fileNo: client.clientNumber || client.fileNo,
        entityType: client.entityType,
        pan: client.pan,
        gstin: client.gstin,
        photoUrl: client.photoUrl
      }
    });
  }

  // Multiple practice workspaces: issue temporary selection token
  const allowedClientUserIds = matchingAccounts.map((m) => m.user._id.toString());
  const selectionToken = generateSelectionToken({
    email: identifier.includes('@') ? identifier : undefined,
    phone: !identifier.includes('@') ? emailOrPhone.trim() : undefined,
    allowedClientUserIds
  });

  const firms = await Promise.all(
    matchingAccounts.map((m) => formatFirmWorkspace(m.user, m.client))
  );

  return sendSuccess(res, 200, 'Multiple practice workspaces found. Please select a workspace.', {
    requiresFirmSelection: true,
    selectionToken,
    firms
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

  const users = await ClientUser.find({
    $or: [
      { email: normalized },
      { phone: identifier.trim() }
    ],
    isActive: true
  }).setOptions({ skipTenantPlugin: true });

  if (!users || users.length === 0) {
    throw new ApiError(404, 'No active client account registered with this email or phone number', 'USER_NOT_FOUND');
  }

  // Filter accounts where parent client allows portal login
  const validAccounts: { user: any; client: any }[] = [];
  for (const u of users) {
    const client = await Client.findById(u.clientId).setOptions({ skipTenantPlugin: true });
    if (client && client.isActive && client.allowLogin) {
      validAccounts.push({ user: u, client });
    }
  }

  if (validAccounts.length === 0) {
    throw new ApiError(
      403,
      'Portal login is not enabled for your organization(s). Please contact your accounting firm.',
      'PORTAL_ACCESS_DISABLED'
    );
  }

  // Generate shared OTP for this login attempt across all matching firm accounts
  const otp = generateOtp();
  for (const { user } of validAccounts) {
    user.otpSecret = {
      code: otp.code,
      expiresAt: otp.expiresAt,
      attempts: 0
    };
    await user.save();
  }

  console.log(`[CLIENT PORTAL OTP] Generated code ${otp.code} for ${identifier} across ${validAccounts.length} workspace(s)`);

  const targetEmail = normalized.includes('@') ? normalized : validAccounts[0].user.email;
  if (targetEmail) {
    let practiceName = 'Your Advisory Firm';
    if (validAccounts.length === 1) {
      const org = await Organization.findById(validAccounts[0].user.tenantId);
      practiceName = org?.name || practiceName;
    } else {
      practiceName = 'Client Portal';
    }

    sendPortalOtpEmail(
      targetEmail,
      otp.code,
      validAccounts[0].user.name || validAccounts[0].client.name,
      practiceName
    ).catch((err) => console.error('[portalRequestOtp] Email send error:', err));
  }

  return sendSuccess(res, 200, 'Verification code sent successfully', {
    identifier,
    expiresInSeconds: 600,
    debugOtp: process.env.NODE_ENV !== 'production' ? otp.code : undefined
  });
});

/**
 * Verify 6-digit OTP and Issue Client JWT (or prompt workspace picker)
 * POST /api/v1/portal/auth/verify-otp
 */
export const portalVerifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    identifier: z.string().min(1, 'Identifier is required'),
    code: z.string().min(6, 'Valid 6-digit code is required')
  });

  const { identifier, code } = schema.parse(req.body);
  const normalized = identifier.trim().toLowerCase();

  const users = await ClientUser.find({
    $or: [
      { email: normalized },
      { phone: identifier.trim() }
    ],
    isActive: true
  }).setOptions({ skipTenantPlugin: true });

  if (!users || users.length === 0) {
    throw new ApiError(400, 'No active OTP verification session found. Please request a new code.', 'INVALID_OTP');
  }

  const matchingUsers = users.filter((u) => u.otpSecret?.code);
  if (matchingUsers.length === 0) {
    throw new ApiError(400, 'No active OTP verification session found. Please request a new code.', 'INVALID_OTP');
  }

  const now = new Date();
  const validOtpUsers = matchingUsers.filter((u) => u.otpSecret && now <= new Date(u.otpSecret.expiresAt));
  if (validOtpUsers.length === 0) {
    for (const u of matchingUsers) {
      u.otpSecret = undefined;
      await u.save();
    }
    throw new ApiError(400, 'Verification code has expired. Please request a new code.', 'OTP_EXPIRED');
  }

  const codeMatch = validOtpUsers.some((u) => u.otpSecret?.code === code.trim());
  if (!codeMatch) {
    for (const u of validOtpUsers) {
      if (u.otpSecret) {
        u.otpSecret.attempts = (u.otpSecret.attempts || 0) + 1;
        await u.save();
      }
    }
    throw new ApiError(400, 'Invalid verification code. Please check and try again.', 'INVALID_OTP');
  }

  // Clear OTP secret on candidate accounts
  for (const u of users) {
    u.otpSecret = undefined;
    await u.save();
  }

  // Find all active practice accounts with login permitted
  const validAccounts: { user: any; client: any }[] = [];
  for (const u of users) {
    const client = await Client.findById(u.clientId).setOptions({ skipTenantPlugin: true });
    if (client && client.isActive && client.allowLogin) {
      validAccounts.push({ user: u, client });
    }
  }

  if (validAccounts.length === 0) {
    throw new ApiError(403, 'Portal login is not enabled for this client organization', 'PORTAL_ACCESS_DISABLED');
  }

  // Single firm workspace: issue session token directly
  if (validAccounts.length === 1) {
    const { user, client } = validAccounts[0];
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
        clientNumber: client.clientNumber || client.fileNo,
        fileNo: client.clientNumber || client.fileNo,
        entityType: client.entityType,
        pan: client.pan,
        gstin: client.gstin,
        photoUrl: client.photoUrl
      }
    });
  }

  // Multiple practice workspaces: return selection token and firm choices
  const allowedClientUserIds = validAccounts.map((v) => v.user._id.toString());
  const selectionToken = generateSelectionToken({
    email: normalized.includes('@') ? normalized : undefined,
    phone: !normalized.includes('@') ? identifier.trim() : undefined,
    allowedClientUserIds
  });

  const firms = await Promise.all(
    validAccounts.map((v) => formatFirmWorkspace(v.user, v.client))
  );

  return sendSuccess(res, 200, 'Verification successful. Please select your workspace.', {
    requiresFirmSelection: true,
    selectionToken,
    firms
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

  const org = await Organization.findById(user.tenantId);
  const practiceName = org?.name || 'Your Advisory Firm';

  try {
    await sendMagicLinkEmail(
      normalized,
      magicUrl,
      user.name || client.name,
      practiceName
    );
  } catch (emailErr) {
    console.error('[portalSendMagicLink] Failed to send magic link email via SMTP:', emailErr);
  }

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
      clientNumber: client.clientNumber || client.fileNo,
      fileNo: client.clientNumber || client.fileNo,
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

/**
 * Select Practice Workspace using Selection Token
 * POST /api/v1/portal/auth/select-firm
 */
export const portalSelectFirm = asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    selectionToken: z.string().min(1, 'Selection token is required'),
    clientUserId: z.string().min(1, 'Client user ID is required')
  });

  const { selectionToken, clientUserId } = schema.parse(req.body);

  const payload = verifySelectionToken(selectionToken);

  if (!payload.allowedClientUserIds.includes(clientUserId)) {
    throw new ApiError(403, 'Unauthorized workspace selection for this session', 'UNAUTHORIZED_WORKSPACE');
  }

  const user = await ClientUser.findById(clientUserId).setOptions({ skipTenantPlugin: true });
  if (!user || !user.isActive) {
    throw new ApiError(403, 'User account is deactivated or not found', 'ACCOUNT_DEACTIVATED');
  }

  const client = await Client.findById(user.clientId).setOptions({ skipTenantPlugin: true });
  if (!client || !client.isActive || !client.allowLogin) {
    throw new ApiError(403, 'Portal login is not enabled for this workspace', 'PORTAL_ACCESS_DISABLED');
  }

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

  const firmWorkspace = await formatFirmWorkspace(user, client);

  return sendSuccess(res, 200, `Workspace switched to ${firmWorkspace.firmName}`, {
    ...tokenData,
    user: userObj,
    client: {
      _id: client._id,
      name: client.name,
      clientNumber: client.clientNumber || client.fileNo,
      fileNo: client.clientNumber || client.fileNo,
      entityType: client.entityType,
      pan: client.pan,
      gstin: client.gstin,
      photoUrl: client.photoUrl
    },
    firm: firmWorkspace
  });
});

/**
 * Switch between Practice Workspaces on the fly for authenticated clients
 * POST /api/v1/portal/auth/switch-firm
 */
export const portalSwitchFirm = asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    targetClientUserId: z.string().min(1, 'Target client user ID is required')
  });

  const { targetClientUserId } = schema.parse(req.body);

  if (!req.clientUser) {
    throw new ApiError(401, 'Unauthorized', 'AUTH_REQUIRED');
  }

  const targetUser = await ClientUser.findById(targetClientUserId).setOptions({ skipTenantPlugin: true });
  if (!targetUser || !targetUser.isActive) {
    throw new ApiError(404, 'Target workspace account not found or inactive', 'TARGET_NOT_FOUND');
  }

  // Security check: Must share the same email or phone as the currently authenticated clientUser
  const isSameEmail =
    Boolean(req.clientUser.email && targetUser.email && req.clientUser.email.toLowerCase() === targetUser.email.toLowerCase());
  const isSamePhone = Boolean(req.clientUser.phone && targetUser.phone && req.clientUser.phone === targetUser.phone);

  if (!isSameEmail && !isSamePhone) {
    throw new ApiError(403, 'You do not have permission to switch to this workspace', 'FORBIDDEN_WORKSPACE_SWITCH');
  }

  const targetClient = await Client.findById(targetUser.clientId).setOptions({ skipTenantPlugin: true });
  if (!targetClient || !targetClient.isActive || !targetClient.allowLogin) {
    throw new ApiError(403, 'Portal access is disabled for target workspace', 'PORTAL_ACCESS_DISABLED');
  }

  targetUser.lastLoginAt = new Date();
  await targetUser.save();

  const tokenData = generateClientToken({
    clientUserId: targetUser._id.toString(),
    clientId: targetClient._id.toString(),
    tenantId: targetUser.tenantId.toString(),
    role: 'Client',
    isClient: true,
    tokenVersion: targetUser.tokenVersion
  });

  const userObj = targetUser.toObject();
  delete userObj.password;
  delete userObj.otpSecret;

  const firmWorkspace = await formatFirmWorkspace(targetUser, targetClient);

  return sendSuccess(res, 200, `Switched workspace to ${firmWorkspace.firmName}`, {
    ...tokenData,
    user: userObj,
    client: {
      _id: targetClient._id,
      name: targetClient.name,
      clientNumber: targetClient.clientNumber || targetClient.fileNo,
      fileNo: targetClient.clientNumber || targetClient.fileNo,
      entityType: targetClient.entityType,
      pan: targetClient.pan,
      gstin: targetClient.gstin,
      photoUrl: targetClient.photoUrl
    },
    firm: firmWorkspace
  });
});

/**
 * List all available practice workspaces for the logged-in client
 * GET /api/v1/portal/auth/my-firms
 */
export const portalGetMyFirms = asyncHandler(async (req: Request, res: Response) => {
  if (!req.clientUser) {
    throw new ApiError(401, 'Unauthorized', 'AUTH_REQUIRED');
  }

  const queryOr: any[] = [];
  if (req.clientUser.email) {
    queryOr.push({ email: req.clientUser.email.toLowerCase() });
  }
  if (req.clientUser.phone) {
    queryOr.push({ phone: req.clientUser.phone });
  }

  if (queryOr.length === 0) {
    return sendSuccess(res, 200, 'My firms retrieved', []);
  }

  const users = await ClientUser.find({
    $or: queryOr,
    isActive: true
  }).setOptions({ skipTenantPlugin: true });

  const firms: any[] = [];
  for (const u of users) {
    const client = await Client.findById(u.clientId).setOptions({ skipTenantPlugin: true });
    if (client && client.isActive && client.allowLogin) {
      const workspace = await formatFirmWorkspace(u, client);
      firms.push({
        ...workspace,
        isCurrent: u._id.toString() === req.clientUser._id.toString()
      });
    }
  }

  return sendSuccess(res, 200, 'My firms retrieved', firms);
});
