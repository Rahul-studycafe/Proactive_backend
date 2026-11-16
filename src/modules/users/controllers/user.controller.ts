import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { User, PlatformUser, Organization } from '../../auth/schemas';
import { Role } from '../../roles/schemas';
import { ApiError } from '../../../common/errors/api-error';
import { sendSuccess, sendError } from '../../../common/responses/api-response';
import { asyncHandler } from '../../../utils/async-handler';
import { sendStaffInvitationEmail } from '../../auth/services/email.service';
import bcrypt from 'bcryptjs';

import { PermissionResolverService } from '../../../services/permission-resolver.service';
import { notificationDispatcher } from '../../../services/notifications/notification-dispatcher.service';
import { getUserReplacementPreviewService } from '../../../services/user-replacement.service';
import { Task } from '../../../models/Task';
import { Invoice } from '../../../models/Invoice';
import { DSC } from '../../../models/DSC';
import mongoose from 'mongoose';

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  username: z.string().min(4, 'Username must be at least 4 characters'),
  email: z.string().email('Valid email address is required for staff invitations'),
  mobile: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
  confirmPassword: z.string().optional().or(z.literal('')),
  roleId: z.string().length(24, 'Invalid role ID').optional(),
  roleIds: z.array(z.string().length(24)).optional(),
  photoUrl: z.string().optional(),
  joiningDate: z.string().or(z.date()).optional(),
  isActive: z.boolean().optional().default(true)
}).refine((data) => {
  if (!data.roleId && (!data.roleIds || data.roleIds.length === 0)) {
    return false;
  }
  return true;
}, {
  message: 'At least one role must be assigned',
  path: ['roleId']
}).refine((data) => {
  if (data.password || data.confirmPassword) {
    return data.password === data.confirmPassword;
  }
  return true;
}, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const result = createUserSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_ERROR', errors);
  }

  const { name, username, email, mobile, password, roleId, roleIds, photoUrl, joiningDate, isActive } = result.data;
  const normalizedEmail = email.toLowerCase();
  const normalizedUsername = username.toLowerCase();

  // Multi-role normalization
  const resolvedRoleIds = (roleIds && roleIds.length > 0) ? roleIds : [roleId!];
  const primaryRoleId = resolvedRoleIds[0];

  // Rule: If a user has a PlatformUser account, they cannot be added into any other tenant
  const platformUserExists = await PlatformUser.findOne({ email: normalizedEmail });
  if (platformUserExists) {
    throw new ApiError(
      400,
      'This email belongs to a registered Practice Owner and cannot be added as a staff member in another organization.',
      'CANNOT_ADD_PLATFORM_USER'
    );
  }

  // Check roles validity and guard Super Admin role
  for (const rId of resolvedRoleIds) {
    const role = await Role.findById(rId);
    if (!role) {
      throw new ApiError(404, `Role not found: ${rId}`, 'ROLE_NOT_FOUND');
    }
    if (role.isSuperAdmin) {
      throw new ApiError(
        403,
        'The Super Admin role is reserved for the practice owner and cannot be assigned to tenant users.',
        'FORBIDDEN'
      );
    }
  }

  // Uniqueness within this tenant
  const existingUsername = await User.findOne({ username: normalizedUsername });
  if (existingUsername) {
    throw new ApiError(409, 'Username is already taken in this organization', 'USERNAME_TAKEN');
  }

  const existingEmail = await User.findOne({ email: normalizedEmail });
  if (existingEmail) {
    throw new ApiError(409, 'User with this email already exists in this organization', 'EMAIL_TAKEN');
  }

  // Determine invitation workflow (Option B: Email Invitation Link if password is not supplied)
  let invitationToken: string | undefined = undefined;
  let invitationExpiresAt: Date | undefined = undefined;
  let invitationStatus: 'active' | 'invited' = 'active';

  if (!password) {
    invitationToken = crypto.randomBytes(32).toString('hex');
    invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    invitationStatus = 'invited';
  }

  const newUser = new User({
    tenantId: req.tenantId,
    name,
    username: normalizedUsername,
    email: normalizedEmail,
    mobile,
    password: password || undefined,
    roleId: primaryRoleId,
    roleIds: resolvedRoleIds,
    isOwner: false,
    invitationStatus,
    invitationToken,
    invitationExpiresAt,
    photoUrl,
    joiningDate: joiningDate ? new Date(joiningDate) : undefined,
    createdBy: req.user?._id,
    isActive: isActive !== undefined ? isActive : true
  });

  await newUser.save();

  // Dispatch invitation email if in invited status
  if (invitationStatus === 'invited' && invitationToken) {
    const org = await Organization.findById(req.tenantId);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const inviteLink = `${frontendUrl}/activate?token=${invitationToken}`;
    sendStaffInvitationEmail(
      normalizedEmail,
      inviteLink,
      org?.name || 'Your Practice',
      req.user?.name || 'Administrator'
    ).catch(console.error);
  }

  const userResponse = newUser.toObject();
  delete userResponse.password;
  delete userResponse.invitationToken;

  return sendSuccess(res, 201, 'User created successfully', { user: userResponse });
});

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const search = req.query.search as string;

  const query: any = {};
  if (req.query.includeDeleted !== 'true') {
    query.isDeleted = { $ne: true };
  }
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { username: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;

  const users = await User.find(query)
    .populate('roleId', 'name')
    .populate('roleIds', 'name')
    .select('-password -refreshToken')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await User.countDocuments(query);

  return sendSuccess(res, 200, 'Users retrieved successfully', {
    users,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  });
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await User.findById(id)
    .populate('roleId', 'name')
    .populate('roleIds', 'name')
    .select('-password -refreshToken');

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  return sendSuccess(res, 200, 'User retrieved successfully', { user });
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  username: z.string().min(4).optional(),
  email: z.string().email().optional().or(z.literal('')),
  mobile: z.string().optional(),
  password: z.string().min(6).optional(),
  confirmPassword: z.string().optional(),
  roleId: z.string().length(24).optional(),
  roleIds: z.array(z.string().length(24)).optional(),
  photoUrl: z.string().optional(),
  joiningDate: z.string().or(z.date()).optional().nullable(),
  isActive: z.boolean().optional()
}).refine((data) => {
  if (data.password || data.confirmPassword) {
    return data.password === data.confirmPassword;
  }
  return true;
}, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = updateUserSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_ERROR', errors);
  }

  const updates = result.data;

  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  // Guard the Practice Owner
  if (user.isOwner) {
    if ((updates.roleId && updates.roleId !== user.roleId.toString()) || updates.roleIds) {
      throw new ApiError(403, 'The practice owner Super Admin role cannot be modified or demoted.', 'FORBIDDEN');
    }
    if (updates.isActive === false) {
      throw new ApiError(403, 'The practice owner account cannot be deactivated.', 'FORBIDDEN');
    }
  }

  if (updates.username && updates.username !== user.username) {
    const existingUser = await User.findOne({ username: updates.username });
    if (existingUser) {
      throw new ApiError(409, 'Username is already taken in this organization', 'USERNAME_TAKEN');
    }
  }

  // Handle role updates (single or multi-role)
  const incomingRoleIds = updates.roleIds || (updates.roleId ? [updates.roleId] : undefined);
  if (incomingRoleIds && incomingRoleIds.length > 0) {
    for (const rId of incomingRoleIds) {
      const role = await Role.findById(rId);
      if (!role) {
        throw new ApiError(404, `Role not found: ${rId}`, 'ROLE_NOT_FOUND');
      }
      if (role.isSuperAdmin && !user.isOwner) {
        throw new ApiError(
          403,
          'The Super Admin role is reserved for the practice owner and cannot be assigned to tenant users.',
          'FORBIDDEN'
        );
      }
    }
    user.roleIds = incomingRoleIds as any;
    user.roleId = incomingRoleIds[0] as any;
  }

  if (updates.name !== undefined) user.name = updates.name;
  if (updates.username !== undefined) user.username = updates.username;
  if (updates.email !== undefined) user.email = updates.email;
  if (updates.mobile !== undefined) user.mobile = updates.mobile;
  if (updates.photoUrl !== undefined) user.photoUrl = updates.photoUrl;
  if (updates.password !== undefined) user.password = updates.password;
  if (updates.joiningDate !== undefined) {
    user.joiningDate = updates.joiningDate ? new Date(updates.joiningDate) : undefined;
  }

  if (updates.isActive !== undefined) {
    if (user.isActive === true && updates.isActive === false) {
      user.tokenVersion += 1;
    }
    user.isActive = updates.isActive;
  }

  await user.save();

  // Invalidate cached permissions for this user
  PermissionResolverService.invalidateUser(user._id.toString());

  // Dispatch security notifications if role or activation status changed
  if (updates.roleId !== undefined || updates.roleIds !== undefined) {
    notificationDispatcher.dispatch({
      tenantId: user.tenantId,
      recipients: [{ userId: user._id, email: user.email, name: user.name }],
      eventKey: 'user:role_changed',
      category: 'security',
      priority: 'high',
      isMandatory: true,
      title: 'Security Notice: Account Role Updated',
      message: `Your system access role and permissions have been updated by ${(req as any).user?.name || 'Administrator'}.`,
      link: `/settings/profile`,
      actorId: (req as any).user?._id,
      actorName: (req as any).user?.name
    }).catch(err => console.error('[updateUser] Role change notification error:', err));
  }

  if (updates.isActive === false) {
    notificationDispatcher.dispatch({
      tenantId: user.tenantId,
      recipients: [{ userId: user._id, email: user.email, name: user.name }],
      eventKey: 'user:deactivated',
      category: 'security',
      priority: 'urgent',
      isMandatory: true,
      title: 'Security Alert: Account Deactivated',
      message: `Your account in the organization has been deactivated.`,
      actorId: (req as any).user?._id,
      actorName: (req as any).user?.name
    }).catch(err => console.error('[updateUser] Deactivation notification error:', err));
  }

  const userResponse = user.toObject();
  delete userResponse.password;
  delete userResponse.refreshToken;

  return sendSuccess(res, 200, 'User updated successfully', { user: userResponse });
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id as string;

  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.isOwner) {
    throw new ApiError(403, 'The practice owner account cannot be deleted.', 'FORBIDDEN');
  }

  if (req.user?._id && user._id.toString() === req.user._id.toString()) {
    throw new ApiError(400, 'You cannot delete your own account.', 'BAD_REQUEST');
  }

  const userObjId = new mongoose.Types.ObjectId(userId);
  const tenantObjId = new mongoose.Types.ObjectId(req.tenantId as any);

  // Guard 1: Active Workload Guard (tasks, clients, services) via replacement preview service
  const preview = await getUserReplacementPreviewService(tenantObjId, userId);
  
  // Guard 2: Reporting Manager Check
  const managedStaffCount = await User.countDocuments({
    tenantId: tenantObjId,
    managerId: userObjId,
    isActive: true,
    isDeleted: { $ne: true }
  });

  // Guard 3: DSC Custody Check
  const activeDscCount = await DSC.countDocuments({
    tenantId: tenantObjId,
    custodianUserId: userObjId
  });

  const hasActiveDependencies =
    preview.activeTasksCount > 0 ||
    preview.clientsCount > 0 ||
    preview.servicesCount > 0 ||
    managedStaffCount > 0 ||
    activeDscCount > 0;

  if (hasActiveDependencies) {
    const reasons: string[] = [];
    if (preview.activeTasksCount > 0) reasons.push(`${preview.activeTasksCount} active task(s)`);
    if (preview.clientsCount > 0) reasons.push(`${preview.clientsCount} client(s)`);
    if (preview.servicesCount > 0) reasons.push(`${preview.servicesCount} service subscription(s)`);
    if (managedStaffCount > 0) reasons.push(`${managedStaffCount} reporting staff member(s)`);
    if (activeDscCount > 0) reasons.push(`${activeDscCount} DSC token(s)`);

    throw new ApiError(
      400,
      `Cannot delete '${user.name}': They are actively assigned to ${reasons.join(', ')}. Please reassign these responsibilities via the Staff Handover feature before removing this user.`,
      'USER_HAS_ACTIVE_DEPENDENCIES'
    );
  }

  // Check historical audit activity
  const [historicalTasksCount, historicalInvoicesCount] = await Promise.all([
    Task.countDocuments({
      tenantId: tenantObjId,
      $or: [
        { assigneeIds: userObjId },
        { 'subtasks.assignedUserId': userObjId },
        { 'timeLogs.userId': userObjId },
        { 'checklist.completedBy': userObjId }
      ]
    }),
    Invoice.countDocuments({
      tenantId: tenantObjId,
      createdBy: userObjId
    })
  ]);

  const hasHistoricalActivity = historicalTasksCount > 0 || historicalInvoicesCount > 0;

  // Soft-Delete (Deactivate & Archive): Preserves historical names across tasks, audit trails and invoices
  if (hasHistoricalActivity || req.query.permanent !== 'true') {
    user.isActive = false;
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = (req as any).user?._id;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate all active JWT sessions immediately
    user.refreshToken = undefined;
    await user.save();

    PermissionResolverService.invalidateUser(user._id.toString());

    // Dispatch security notification
    notificationDispatcher.dispatch({
      tenantId: user.tenantId,
      recipients: [{ userId: user._id, email: user.email, name: user.name }],
      eventKey: 'user:deactivated',
      category: 'security',
      priority: 'urgent',
      isMandatory: true,
      title: 'Security Alert: Account Deactivated',
      message: `Your account in the organization has been deactivated.`,
      actorId: (req as any).user?._id,
      actorName: (req as any).user?.name
    }).catch(err => console.error('[deleteUser] Notification error:', err));

    return sendSuccess(res, 200, 'User deactivated and archived successfully. Historical records have been preserved.', {
      id: user._id,
      isDeleted: true
    });
  }

  // Pure draft account with zero historical activity: Physical hard delete permitted
  await User.findByIdAndDelete(userId);
  PermissionResolverService.invalidateUser(userId);

  return sendSuccess(res, 200, 'User deleted successfully', null);
});

/**
 * Phase 120: Atomic User Replacement Utility (Staff Handover)
 */
export const getUserReplacementPreview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const userId = req.query.userId as string;
  if (!userId) {
    throw new ApiError(400, 'userId query parameter is required', 'VALIDATION_FAILED');
  }

  const { getUserReplacementPreviewService } = await import('../../../services/user-replacement.service');
  const preview = await getUserReplacementPreviewService(req.tenantId as any, userId);

  return sendSuccess(res, 200, 'User replacement preview retrieved successfully', preview);
});

export const replaceUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const {
    departingUserId,
    replacementUserId,
    reassignTasks,
    reassignClients,
    reassignServices,
    deactivateUser
  } = req.body;

  if (!departingUserId || !replacementUserId) {
    throw new ApiError(
      400,
      'departingUserId and replacementUserId are required',
      'VALIDATION_FAILED'
    );
  }

  const { replaceUserService } = await import('../../../services/user-replacement.service');
  const result = await replaceUserService(req.tenantId as any, {
    departingUserId,
    replacementUserId,
    reassignTasks,
    reassignClients,
    reassignServices,
    deactivateUser
  });

  return sendSuccess(res, 200, 'User responsibilities replaced successfully', result);
});
