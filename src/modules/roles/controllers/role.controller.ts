import { Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Role } from '../schemas';
import { User } from '../../auth/schemas';
import { ApiError } from '../../../common/errors/api-error';
import { sendSuccess } from '../../../common/responses/api-response';
import { asyncHandler } from '../../../utils/async-handler';

// Zod schema for validating the complex permission matrix
const permissionModuleSchema = z.object({
  create: z.object({
    allowed: z.boolean(),
    scope: z.enum(['everything', 'team_only', 'assigned_only'])
  }).optional(),
  edit: z.object({
    allowed: z.boolean(),
    scope: z.enum(['everything', 'team_only', 'assigned_only'])
  }).optional(),
  view: z.object({
    allowed: z.boolean(),
    scope: z.enum(['everything', 'team_only', 'assigned_only'])
  }).optional(),
  delete: z.object({
    allowed: z.boolean(),
    scope: z.enum(['everything', 'team_only', 'assigned_only'])
  }).optional()
});

const roleSchema = z.object({
  name: z.string().min(2, 'Role name must be at least 2 characters'),
  permissions: z.record(z.string(), permissionModuleSchema)
});

export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const result = roleSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_ERROR', errors);
  }

  const { name, permissions } = result.data;

  const existingRole = await Role.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (existingRole) {
    throw new ApiError(409, 'Role name already exists', 'ROLE_EXISTS');
  }

  const role = new Role({
    tenantId: req.tenantId,
    name,
    permissions: permissions as any,
    isSuperAdmin: false
  });

  await role.save();

  return sendSuccess(res, 201, 'Role created successfully', { role });
});

export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = roleSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_ERROR', errors);
  }

  const { name, permissions } = result.data;

  const role = await Role.findById(id);
  if (!role) {
    throw new ApiError(404, 'Role not found', 'ROLE_NOT_FOUND');
  }

  if (role.isSuperAdmin) {
    throw new ApiError(403, 'Super Admin role cannot be modified', 'FORBIDDEN');
  }

  if (role.name !== name) {
    const existingRole = await Role.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, _id: { $ne: id } });
    if (existingRole) {
      throw new ApiError(409, 'Role name already exists', 'ROLE_EXISTS');
    }
  }

  role.name = name;
  role.permissions = permissions as any;
  await role.save();

  return sendSuccess(res, 200, 'Role updated successfully', { role });
});

export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const roles = await Role.aggregate([
    { $match: { tenantId: req.tenantId } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: 'roleId',
        as: 'assignedUsers'
      }
    },
    {
      $addFields: {
        assignedUsersCount: { $size: '$assignedUsers' }
      }
    },
    {
      $project: {
        assignedUsers: 0
      }
    },
    { $sort: { createdAt: 1 } }
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

export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const role = await Role.findById(id);
  if (!role) {
    throw new ApiError(404, 'Role not found', 'ROLE_NOT_FOUND');
  }

  if (role.isSuperAdmin) {
    throw new ApiError(403, 'Super Admin role cannot be deleted', 'FORBIDDEN');
  }

  const assignedUsersCount = await User.countDocuments({ roleId: id });
  if (assignedUsersCount > 0) {
    throw new ApiError(400, 'Cannot delete role while users are assigned to it', 'ROLE_IN_USE');
  }

  await Role.findByIdAndDelete(id);

  return sendSuccess(res, 200, 'Role deleted successfully');
});
