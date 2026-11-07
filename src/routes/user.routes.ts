import { Router } from 'express';
import { createUser, getUsers, getUserById, updateUser, replaceUser, deleteUser } from '../modules/users/controllers/user.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { checkSeatLimit } from '../middlewares/plan-guard';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Phase 120: Atomic User Replacement Utility (Staff Handover)
router.post('/replace-user', replaceUser);

// List users (requires 'user:view' or task assignment/creation permissions)
router.get('/', authorize(['user:view', 'task:assign', 'task:create', 'task:edit']), getUsers);

// Get single user
router.get('/:id', authorize(['user:view', 'task:assign', 'task:create', 'task:edit']), getUserById);

// Create a new user (requires 'user.create' permission and within SaaS seat quota)
router.post('/', authorize('user', 'create'), checkSeatLimit, createUser);

// Update user (requires 'user.edit' permission)
router.put('/:id', authorize('user', 'edit'), updateUser);

// Delete user (requires 'user.delete' permission)
router.delete('/:id', authorize('user', 'delete'), deleteUser);

export default router;
