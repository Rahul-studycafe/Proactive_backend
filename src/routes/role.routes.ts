import { Router } from 'express';
import { createRole, getRoles, getRoleById, updateRole, deleteRole } from '../modules/roles/controllers/role.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

// All role routes require authentication
router.use(authenticate);

// Get all roles
router.get('/', authorize('settings', 'view'), getRoles);

// Get single role
router.get('/:id', authorize('settings', 'view'), getRoleById);

// Create a new role
router.post('/', authorize('settings', 'manageMasters'), createRole);

// Update role
router.put('/:id', authorize('settings', 'manageMasters'), updateRole);

// Delete role
router.delete('/:id', authorize('settings', 'manageMasters'), deleteRole);

export default router;
