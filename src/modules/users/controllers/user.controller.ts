import { Request, Response } from 'express';
import { z } from 'zod';
import { User } from '../../auth/schemas';
import { Role } from '../../roles/schemas';
import { ApiError } from '../../../common/errors/api-error';
import { sendSuccess, sendError } from '../../../common/responses/api-response';
import { asyncHandler } from '../../../utils/async-handler';
import bcrypt from 'bcryptjs';

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  username: z.string().min(4, 'Username must be at least 4 characters'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  mobile: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  roleId: z.string().length(24, 'Invalid role ID'),
  photoUrl: z.string().optional(),
  joiningDate: z.string().or(z.date()).optional(),
  isActive: z.boolean().optional().default(true)
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const result = createUserSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_ERROR', errors);
  }

  const { name, username, email, mobile, password, roleId, photoUrl, joiningDate, isActive } = result.data;

  const role = await Role.findById(roleId);
  if (!role) {
    throw new ApiError(404, 'Role not found', 'ROLE_NOT_FOUND');
  }

  const existingUser = await User.findOne({ username });
  if (existingUser) {
    throw new ApiError(409, 'Username is already taken in this organization', 'USERNAME_TAKEN');
  }

  const newUser = new User({
    tenantId: req.tenantId,
    name,
    username,
    email,
    mobile,
    password,
    roleId,
    photoUrl,
    joiningDate: joiningDate ? new Date(joiningDate) : undefined,
    isActive
  });

  await newUser.save();

  const userResponse = newUser.toObject();
  delete userResponse.password;

  return sendSuccess(res, 201, 'User created successfully', { user: userResponse });
});

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const search = req.query.search as string;

  const query: any = {};
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

  if (updates.username && updates.username !== user.username) {
    const existingUser = await User.findOne({ username: updates.username });
    if (existingUser) {
      throw new ApiError(409, 'Username is already taken in this organization', 'USERNAME_TAKEN');
    }
  }

  if (updates.roleId && updates.roleId !== user.roleId.toString()) {
    const role = await Role.findById(updates.roleId);
    if (!role) {
      throw new ApiError(404, 'Role not found', 'ROLE_NOT_FOUND');
    }
  }

  if (updates.name !== undefined) user.name = updates.name;
  if (updates.username !== undefined) user.username = updates.username;
  if (updates.email !== undefined) user.email = updates.email;
  if (updates.mobile !== undefined) user.mobile = updates.mobile;
  if (updates.roleId !== undefined) user.roleId = updates.roleId as any;
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

  const userResponse = user.toObject();
  delete userResponse.password;
  delete userResponse.refreshToken;

  return sendSuccess(res, 200, 'User updated successfully', { user: userResponse });
});

/**
 * Phase 120: Atomic User Replacement Utility (Staff Handover)
 */
export const replaceUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(403, 'Tenant context missing', 'FORBIDDEN');
  }

  const {
    departingUserId,
    replacementUserId,
    reassignTasks,
    reassignClients,
    reassignServices
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
    reassignServices
  });

  return sendSuccess(res, 200, 'User responsibilities replaced successfully', result);
});
