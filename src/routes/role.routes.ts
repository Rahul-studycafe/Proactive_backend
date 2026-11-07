import { Router } from 'express';
import {
  createRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole,
  getPermissionsCatalogue,
  duplicateRole,
} from '../modules/roles/controllers/role.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

// All role routes require authentication
router.use(authenticate);

// Get full permission catalogue & blueprint definitions for UI
router.get('/catalogue', authorize('role:view'), getPermissionsCatalogue);

// Duplicate a role
router.post('/:id/duplicate', authorize('role:manage'), duplicateRole);

// Standard Role CRUD
router.get('/', authorize('role:view'), getRoles);
router.get('/:id', authorize('role:view'), getRoleById);
router.post('/', authorize('role:manage'), createRole);
router.put('/:id', authorize('role:manage'), updateRole);
router.delete('/:id', authorize('role:manage'), deleteRole);

export default router;
