import { Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Role } from '../schemas';
import { User } from '../../auth/schemas';
import { ApiError } from '../../../common/errors/api-error';
import { sendSuccess } from '../../../common/responses/api-response';
import { asyncHandler } from '../../../utils/async-handler';
import {
  PERMISSION_CATALOGUE,
  PERMISSION_CATEGORIES,
  getDefaultRoleBlueprints,
} from '../../../config/permissions-catalogue';
import { PermissionResolverService } from '../../../services/permission-resolver.service';
import { RoleSeederService } from '../../../services/role-seeder.service';
import { RoleAuditLog } from '../../../models/RoleAuditLog';

// Validation schema for creating/updating roles
const roleInputSchema = z.object({
  name: z.string().min(2, 'Role name must be at least 2 characters').trim(),
  description: z.string().optional(),
  permissions: z.record(
    z.string(),
    z.object({
      allowed: z.boolean(),
      scope: z.enum(['everything', 'team_only', 'assigned_only']).default('everything'),
    })
  ),
});

export const getPermissionsCatalogue = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, 200, 'Permission catalogue retrieved successfully', {
    catalogue: PERMISSION_CATALOGUE,
    categories: PERMISSION_CATEGORIES,
    blueprints: getDefaultRoleBlueprints(),
  });
});

export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const tenantObjectId = new mongoose.Types.ObjectId(req.tenantId);
  // Ensure default roles are seeded and existing roles synchronized with new catalogue permissions
  await RoleSeederService.seedDefaultRolesForTenant(tenantObjectId);

  const roles = await Role.aggregate([
    { $match: { tenantId: tenantObjectId } },
    {
      $lookup: {
        from: 'users',
        let: { roleId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$roleId', '$$roleId'] },
                  { $in: ['$$roleId', { $ifNull: ['$roleIds', []] }] },
                ],
              },
              isActive: true,
            },
          },
        ],
        as: 'assignedUsers',
      },
    },
    {
      $addFields: {
        assignedUsersCount: { $size: '$assignedUsers' },
      },
    },
    {
      $project: {
        assignedUsers: 0,
      },
    },
    { $sort: { isSuperAdmin: -1, isSystemDefault: -1, createdAt: 1 } },
  ]);

  return sendSuccess(res, 200, 'Roles retrieved successfully', { roles });
});

export const getRoleById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const role = await Role.findById(id);
  if (!role) {
    throw new ApiError(404, 'Role not found', 'ROLE_NOT_FOUND');
  }

  return sendSuccess(res, 200, 'Role retrieved successfully', { role });
});

export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const result = roleInputSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_ERROR', errors);
  }

  const { name, description, permissions } = result.data;

  // Tenant unique name check
  const existingRole = await Role.findOne({
    tenantId: req.tenantId,
    name: { $regex: new RegExp(`^${name}$`, 'i') },
  });
  if (existingRole) {
    throw new ApiError(409, 'A role with this name already exists in your organization', 'ROLE_EXISTS');
  }

  const role = new Role({
    tenantId: req.tenantId,
    name,
    description,
    permissions,
    isSuperAdmin: false,
    isSystemDefault: false,
    createdBy: req.user?._id,
  });

  await role.save();

  // Audit Log
  await RoleAuditLog.create({
    tenantId: req.tenantId,
    actorId: req.user?._id,
    actorEmail: (req.user as any)?.email || (req.user as any)?.username || 'admin',
    action: 'ROLE_CREATED',
    targetRoleId: role._id,
    targetRoleName: role.name,
    changes: {
      addedPermissions: Object.keys(permissions).filter((k) => permissions[k].allowed),
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  }).catch((err) => console.error('[createRole] Audit log error:', err));

  return sendSuccess(res, 201, 'Role created successfully', { role });
});

export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = roleInputSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_ERROR', errors);
  }

  const { name, description, permissions } = result.data;

  const role = await Role.findById(id);
  if (!role) {
    throw new ApiError(404, 'Role not found', 'ROLE_NOT_FOUND');
  }

  if (role.isSuperAdmin) {
    throw new ApiError(403, 'The Super Admin role cannot be modified', 'FORBIDDEN');
  }

  // If renaming, check uniqueness
  if (role.name.toLowerCase() !== name.toLowerCase()) {
    const existingRole = await Role.findOne({
      tenantId: req.tenantId,
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      _id: { $ne: id },
    });
    if (existingRole) {
      throw new ApiError(409, 'A role with this name already exists in your organization', 'ROLE_EXISTS');
    }
  }

  const oldPermissions = role.permissions || {};
  role.name = name;
  if (description !== undefined) role.description = description;
  role.permissions = permissions;
  role.updatedBy = req.user?._id;

  await role.save();

  // Invalidate cache for all users of this tenant
  PermissionResolverService.invalidateTenant(req.tenantId!.toString());

  // Audit Log
  const added = Object.keys(permissions).filter((k) => permissions[k]?.allowed && !oldPermissions[k]?.allowed);
  const removed = Object.keys(oldPermissions).filter((k) => oldPermissions[k]?.allowed && !permissions[k]?.allowed);

  await RoleAuditLog.create({
    tenantId: req.tenantId,
    actorId: req.user?._id,
    actorEmail: (req.user as any)?.email || (req.user as any)?.username || 'admin',
    action: 'ROLE_UPDATED',
    targetRoleId: role._id,
    targetRoleName: role.name,
    changes: {
      addedPermissions: added,
      removedPermissions: removed,
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  }).catch((err) => console.error('[updateRole] Audit log error:', err));

  return sendSuccess(res, 200, 'Role updated successfully', { role });
});

export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const role = await Role.findById(id);
  if (!role) {
    throw new ApiError(404, 'Role not found', 'ROLE_NOT_FOUND');
  }

  if (role.isSuperAdmin) {
    throw new ApiError(403, 'The Super Admin role cannot be deleted', 'FORBIDDEN');
  }

  // Check if any users are currently assigned to this role
  const assignedUsersCount = await User.countDocuments({
    tenantId: req.tenantId,
    $or: [{ roleId: id }, { roleIds: id }],
  });

  if (assignedUsersCount > 0) {
    throw new ApiError(
      400,
      `Cannot delete role "${role.name}" because ${assignedUsersCount} user(s) are currently assigned to it. Please reassign them first.`,
      'ROLE_IN_USE'
    );
  }

  await Role.findByIdAndDelete(id);

  // Invalidate cache
  PermissionResolverService.invalidateTenant(req.tenantId!.toString());

  // Audit Log
  await RoleAuditLog.create({
    tenantId: req.tenantId,
    actorId: req.user?._id,
    actorEmail: (req.user as any)?.email || (req.user as any)?.username || 'admin',
    action: 'ROLE_DELETED',
    targetRoleId: role._id,
    targetRoleName: role.name,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  }).catch((err) => console.error('[deleteRole] Audit log error:', err));

  return sendSuccess(res, 200, `Role "${role.name}" deleted successfully`);
});

export const duplicateRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const role = await Role.findById(id);
  if (!role) {
    throw new ApiError(404, 'Role not found', 'ROLE_NOT_FOUND');
  }

  const baseName = `${role.name} Copy`;
  let newName = baseName;
  let counter = 1;

  while (await Role.findOne({ tenantId: req.tenantId, name: { $regex: new RegExp(`^${newName}$`, 'i') } })) {
    counter++;
    newName = `${baseName} ${counter}`;
  }

  const newRole = new Role({
    tenantId: req.tenantId,
    name: newName,
    description: `Copy of ${role.name}`,
    permissions: role.permissions,
    isSuperAdmin: false,
    isSystemDefault: false,
    createdBy: req.user?._id,
  });

  await newRole.save();

  return sendSuccess(res, 201, `Role duplicated as "${newName}"`, { role: newRole });
});
