import { Router } from 'express';
import { createUser, getUsers, getUserById, updateUser } from '../controllers/user.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// List users (requires 'user.view' permission)
router.get('/', authorize('user', 'view'), getUsers);

// Get single user
router.get('/:id', authorize('user', 'view'), getUserById);

// Create a new user (requires 'user.create' permission)
router.post('/', authorize('user', 'create'), createUser);

// Update user (requires 'user.edit' permission)
router.put('/:id', authorize('user', 'edit'), updateUser);

export default router;
