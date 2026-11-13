import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { SsoClient, ISsoClient } from '../models/SsoClient';
import { SsoTicket, ISsoTicket } from '../models/SsoTicket';
import { PlatformUser, User, Organization } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { BillingEntity, TenantSettings } from '../modules/masters/schemas';
import { TenantConfigurationService } from './tenant-configuration.service';
import { generateAccessToken, generateRefreshToken } from '../modules/auth/services/auth.service';
import { ApiError } from '../common/errors/api-error';

export interface UserResolutionResult {
  targetUser: any;
  targetTenantId: mongoose.Types.ObjectId;
  targetRoleId: mongoose.Types.ObjectId;
  platformUserId?: mongoose.Types.ObjectId;
  isOwner: boolean;
  email: string;
  name?: string;
  isNewOrganization?: boolean;
}

export class SsoService {
  /**
   * Validates external client credentials (clientId and clientSecret)
   */
  static async verifyClientCredentials(clientId: string, clientSecret: string): Promise<ISsoClient> {
    if (!clientId || !clientSecret) {
      throw new ApiError(401, 'External application clientId and clientSecret are required', 'SSO_AUTH_REQUIRED');
    }

    const client = await SsoClient.findOne({ clientId, isActive: true }).select('+clientSecretHash');
    if (!client) {
      throw new ApiError(401, 'Invalid or inactive external application clientId', 'INVALID_SSO_CLIENT');
    }

    const isMatch = await bcrypt.compare(clientSecret, client.clientSecretHash);
    if (!isMatch) {
      throw new ApiError(401, 'Invalid external application clientSecret', 'INVALID_SSO_SECRET');
    }

    client.lastUsedAt = new Date();
    await client.save();

    return client;
  }

  /**
   * Resolves an existing PMS account or auto-provisions a single practice organization
   * according to the strict 1:1 email-to-organization architecture.
   */
  static async resolveOrCreateUser(
    client: ISsoClient,
    payload: {
      email: string;
      name: string;
      expiryDate: string;
      password?: string;
      mobile?: string;
      externalUserId?: string;
    }
  ): Promise<UserResolutionResult> {
    const normalizedEmail = payload.email.trim().toLowerCase();
    const displayName = payload.name.trim();

    const planExpiry = new Date(payload.expiryDate);
    if (isNaN(planExpiry.getTime())) {
      throw new ApiError(400, 'Invalid expiryDate format. Must be a valid date string', 'INVALID_EXPIRY_DATE');
    }

    // 1. Check PlatformUser (Practice Owner)
    const platformUser = await PlatformUser.findOne({ email: normalizedEmail, status: 'active' });
    if (platformUser) {
      let org = await Organization.findOne({ ownerId: platformUser._id });
      
      // Auto-heal: If platformUser exists but org document was deleted or missing
      if (!org) {
        const existingTenantUser = await User.findOne({ platformUserId: platformUser._id })
          .setOptions({ skipTenantPlugin: true });
        if (existingTenantUser?.tenantId) {
          org = await Organization.findById(existingTenantUser.tenantId);
          if (org) {
            org.ownerId = platformUser._id as mongoose.Types.ObjectId;
            await org.save();
          }
        }
      }

      if (!org) {
        // Auto-provision organization and workspace user for this owner using Automation Cafe plan expiry
        return await this.autoProvisionPracticeOwner(client, {
          email: normalizedEmail,
          name: displayName,
          expiryDate: planExpiry,
          password: payload.password,
          mobile: payload.mobile,
          externalUserId: payload.externalUserId
        });
      }

      // Synchronize existing organization's renewal date directly with Automation Cafe plan expiry!
      org.renewalDate = planExpiry;
      org.subscriptionStatus = 'active';
      await org.save();

      let needsSave = false;
      if (platformUser.name !== displayName) {
        platformUser.name = displayName;
        needsSave = true;
      }
      if (payload.password) {
        platformUser.password = payload.password; // Mongoose pre-save hook hashes with bcrypt
        needsSave = true;
      }
      if (needsSave) {
        await platformUser.save();
      }

      let tenantUser = await User.findOne({ tenantId: org._id, isOwner: true })
        .setOptions({ skipTenantPlugin: true });

      if (!tenantUser) {
        tenantUser = await User.findOne({ platformUserId: platformUser._id })
          .setOptions({ skipTenantPlugin: true });
      }

      if (!tenantUser) {
        throw new ApiError(404, 'Owner workspace user profile not found', 'USER_NOT_FOUND');
      }

      if (payload.password) {
        tenantUser.password = payload.password; // Mongoose pre-save hook hashes with bcrypt
        await tenantUser.save();
      }

      return {
        targetUser: tenantUser,
        targetTenantId: org._id as mongoose.Types.ObjectId,
        targetRoleId: tenantUser.roleId as mongoose.Types.ObjectId,
        platformUserId: platformUser._id as mongoose.Types.ObjectId,
        isOwner: true,
        email: normalizedEmail,
        name: platformUser.name || displayName,
        isNewOrganization: false
      };
    }

    // 2. Check TenantUser (Staff / Employee in single assigned organization)
    const tenantUser = await User.findOne({ email: normalizedEmail, isActive: true })
      .setOptions({ skipTenantPlugin: true });

    if (tenantUser) {
      const org = await Organization.findById(tenantUser.tenantId);
      if (!org) {
        throw new ApiError(404, 'Assigned practice organization not found for staff member', 'ORG_NOT_FOUND');
      }

      return {
        targetUser: tenantUser,
        targetTenantId: tenantUser.tenantId as mongoose.Types.ObjectId,
        targetRoleId: tenantUser.roleId as mongoose.Types.ObjectId,
        platformUserId: tenantUser.platformUserId as mongoose.Types.ObjectId | undefined,
        isOwner: tenantUser.isOwner || false,
        email: normalizedEmail,
        name: tenantUser.name || displayName
      };
    }

    // 3. User does not exist in PMS
    if (client.provisioningMode === 'require_existing') {
      throw new ApiError(
        404,
        'User account not found in Practice Management. Please complete initial registration.',
        'USER_NOT_REGISTERED'
      );
    }

    // 4. Auto-provision practice organization and owner account
    return await this.autoProvisionPracticeOwner(client, {
      email: normalizedEmail,
      name: displayName,
      expiryDate: planExpiry,
      password: payload.password,
      mobile: payload.mobile,
      externalUserId: payload.externalUserId
    });
  }

  /**
   * Auto-provisions a single practice owner, organization, role, and workspace user.
   */
  private static async autoProvisionPracticeOwner(
    client: ISsoClient,
    data: {
      email: string;
      name: string;
      expiryDate: Date;
      password?: string;
      mobile?: string;
      externalUserId?: string;
    }
  ): Promise<UserResolutionResult> {
    const userPassword = data.password || crypto.randomBytes(24).toString('base64');
    const orgName = `${data.name}'s Practice`;

    // Base slug generated from organization name
    const baseSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'practice';
    const uniqueSlug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;

    // Base unique username
    const baseUsername = data.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
    let username = baseUsername;
    const existingUsername = await User.findOne({ username }).setOptions({ skipTenantPlugin: true });
    if (existingUsername) {
      username = `${baseUsername}${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // 1. Create or reuse Platform User
    let platformUser = await PlatformUser.findOne({ email: data.email });
    if (!platformUser) {
      platformUser = new PlatformUser({
        name: data.name,
        email: data.email,
        mobile: data.mobile || '',
        password: userPassword, // hashed by pre-save hook
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        status: 'active',
        tokenVersion: 1
      });
      await platformUser.save();
    } else if (data.password) {
      platformUser.password = data.password;
      await platformUser.save();
    }

    // 2. Create Organization with exact Automation Cafe expiry
    const organization = new Organization({
      name: orgName,
      slug: uniqueSlug,
      ownerId: platformUser._id,
      plan: {
        maxUsers: client.defaultPlanMaxUsers || 5
      },
      subscriptionStatus: 'active',
      subscriptionDuration: 'yearly',
      renewalDate: data.expiryDate
    });
    await organization.save();

    // 3. Create Super Admin Role
    const superAdminRole = new Role({
      tenantId: organization._id,
      name: 'Super Admin',
      description: 'System generated super admin role',
      isSuperAdmin: true,
      permissions: {}
    });
    await superAdminRole.save();

    // 4. Create Anchor User Record
    const userRecord = new User({
      tenantId: organization._id,
      platformUserId: platformUser._id,
      name: data.name,
      username,
      password: userPassword,
      email: data.email,
      mobile: data.mobile || '',
      roleId: superAdminRole._id,
      isOwner: true,
      invitationStatus: 'active',
      tokenVersion: 1
    });
    await userRecord.save();

    // 5. Create Default Billing Entity
    const billing = new BillingEntity({
      tenantId: organization._id,
      name: orgName,
      invoicePrefix: 'INV-',
      receiptPrefix: 'RCT-'
    });
    await billing.save();

    // 6. Create Tenant Settings
    const settings = new TenantSettings({
      tenantId: organization._id,
      clientCustomFields: [],
      allowDuplicateClientNames: false,
      defaultGstPercentage: 18
    });
    await settings.save();

    // 7. Seed Default Tenant Configurations (Storage locations, drop-downs, registers)
    try {
      await TenantConfigurationService.seedDefaultsForTenant(organization._id as mongoose.Types.ObjectId);
    } catch (err) {
      console.error('Error seeding default configurations for auto-provisioned organization:', err);
    }

    return {
      targetUser: userRecord,
      targetTenantId: organization._id as mongoose.Types.ObjectId,
      targetRoleId: superAdminRole._id as mongoose.Types.ObjectId,
      platformUserId: platformUser._id as mongoose.Types.ObjectId,
      isOwner: true,
      email: data.email,
      name: data.name,
      isNewOrganization: true
    };
  }

  /**
   * Generates a single-use, high-entropy SSO ticket valid for 60 seconds.
   */
  static async createSsoTicket(
    client: ISsoClient,
    resolution: UserResolutionResult,
    options: { redirectPath?: string; state?: string }
  ): Promise<{ ticket: string; exchangeUrl: string; expiresIn: number }> {
    const code = `sso_tkt_${crypto.randomBytes(32).toString('hex')}`;
    const expiresInSeconds = 60;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const safeRedirectPath = (options.redirectPath && /^\/[a-zA-Z0-9_\-\/?&=#]*$/.test(options.redirectPath))
      ? options.redirectPath
      : '/';

    const ticket = new SsoTicket({
      code,
      clientId: client.clientId,
      email: resolution.email,
      name: resolution.name,
      targetUserId: resolution.targetUser._id,
      targetTenantId: resolution.targetTenantId,
      targetRoleId: resolution.targetRoleId,
      platformUserId: resolution.platformUserId,
      isOwner: resolution.isOwner,
      isNewOrganization: resolution.isNewOrganization || false,
      redirectPath: safeRedirectPath,
      state: options.state || undefined,
      used: false,
      expiresAt
    });

    await ticket.save();

    const frontendBaseUrl = (process.env.FRONTEND_URL || 'http://localhost:8080').replace(/\/$/, '');
    let exchangeUrl = `${frontendBaseUrl}/sso/exchange?ticket=${encodeURIComponent(code)}`;
    if (options.state) {
      exchangeUrl += `&state=${encodeURIComponent(options.state)}`;
    }

    return {
      ticket: code,
      exchangeUrl,
      expiresIn: expiresInSeconds
    };
  }

  /**
   * Atomically consumes a single-use SSO ticket and issues PMS JWT session tokens.
   */
  static async consumeSsoTicket(ticketCode: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: any;
    organization: any;
    isNewOrganization?: boolean;
    redirectPath: string;
  }> {
    if (!ticketCode || typeof ticketCode !== 'string') {
      throw new ApiError(400, 'Ticket parameter is required', 'VALIDATION_FAILED');
    }

    // Atomic find and set used: true
    const ticket = await SsoTicket.findOneAndUpdate(
      { code: ticketCode, used: false, expiresAt: { $gt: new Date() } },
      { $set: { used: true } },
      { new: false }
    );

    if (!ticket) {
      const existingTicket = await SsoTicket.findOne({ code: ticketCode });
      if (existingTicket && existingTicket.used) {
        throw new ApiError(400, 'This SSO ticket has already been used. Please initiate login again.', 'TICKET_ALREADY_USED');
      }
      throw new ApiError(400, 'SSO ticket is invalid or has expired (tickets expire after 60 seconds).', 'INVALID_TICKET');
    }

    // Load User and Organization
    const user = await User.findById(ticket.targetUserId)
      .populate('roleId')
      .setOptions({ skipTenantPlugin: true });

    if (!user) {
      throw new ApiError(404, 'Associated user workspace not found', 'USER_NOT_FOUND');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'User account has been deactivated', 'ACCOUNT_DEACTIVATED');
    }

    const organization = await Organization.findById(ticket.targetTenantId);
    if (!organization) {
      throw new ApiError(404, 'Practice organization not found', 'ORG_NOT_FOUND');
    }

    const roleIdString = (user.roleId as any)?._id
      ? (user.roleId as any)._id.toString()
      : user.roleId.toString();

    const tokenPayload = {
      userId: user._id.toString(),
      platformUserId: ticket.platformUserId ? ticket.platformUserId.toString() : undefined,
      tenantId: organization._id.toString(),
      roleId: roleIdString,
      tokenVersion: user.tokenVersion || 0,
      isOwner: ticket.isOwner
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    user.refreshToken = refreshToken;
    await user.save();

    if (ticket.platformUserId) {
      await PlatformUser.findByIdAndUpdate(ticket.platformUserId, {
        refreshToken,
        lastLoginAt: new Date()
      });
    }

    return {
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        roleId: user.roleId,
        isOwner: ticket.isOwner,
        userType: ticket.isOwner ? 'PlatformUser' : 'TenantUser'
      },
      organization: {
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        subscriptionStatus: organization.subscriptionStatus,
        isNewOrganization: ticket.isNewOrganization || false
      },
      isNewOrganization: ticket.isNewOrganization || false,
      redirectPath: ticket.redirectPath || '/'
    };
  }

  /**
   * Updates an organization's display name and regenerates slug.
   */
  static async updateOrganizationName(tenantId: string | mongoose.Types.ObjectId, newName: string) {
    const trimmed = (newName || '').trim();
    if (!trimmed || trimmed.length < 2) {
      throw new ApiError(400, 'Organization name must be at least 2 characters long', 'VALIDATION_FAILED');
    }

    const org = await Organization.findById(tenantId);
    if (!org) {
      throw new ApiError(404, 'Practice organization not found', 'ORG_NOT_FOUND');
    }

    const oldName = org.name;
    org.name = trimmed;

    const baseSlug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'practice';
    org.slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
    await org.save();

    // Also sync the default billing entity if it held the old name
    try {
      await BillingEntity.updateOne(
        { tenantId: org._id, name: oldName },
        { name: trimmed }
      );
    } catch { }

    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      subscriptionStatus: org.subscriptionStatus
    };
  }
}

