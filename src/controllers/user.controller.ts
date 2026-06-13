import { Request, Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  username: z.string().min(4, 'Username must be at least 4 characters'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  mobile: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  roleId: z.string().length(24, 'Invalid role ID'),
  photoUrl: z.string().optional(),
  isActive: z.boolean().optional().default(true)
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"] // path of error
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  // Validate incoming payload
  const result = createUserSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_ERROR', errors);
  }

  const { name, username, email, mobile, password, roleId, photoUrl, isActive } = result.data;

  // Verify the role exists (since it is scoped by tenantPlugin, it ensures the role belongs to this tenant)
  const role = await Role.findById(roleId);
  if (!role) {
    throw new ApiError(404, 'Role not found', 'ROLE_NOT_FOUND');
  }

  // Check if username is already taken in this tenant
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    throw new ApiError(409, 'Username is already taken in this organization', 'USERNAME_TAKEN');
  }

  // Create User
  const newUser = new User({
    tenantId: req.tenantId, // Auto-injected by authenticate middleware
    name,
    username,
    email,
    mobile,
    password,
    roleId,
    photoUrl,
    isActive
  });

  await newUser.save();

  // Hide password in response
  const userResponse = newUser.toObject();
  delete userResponse.password;

  return sendSuccess(res, 201, 'User created successfully', { user: userResponse });
});
