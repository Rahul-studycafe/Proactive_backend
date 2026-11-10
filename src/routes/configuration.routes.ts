import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  getCategories,
  getOptions,
  createOption,
  updateOption,
  toggleOptionStatus,
  deleteOption,
  reorderOptions,
} from '../controllers/configuration.controller';

const router = Router();

router.use(authenticate);

// Listing categories and options is open to authenticated tenant users
router.get('/categories', getCategories);
router.get('/', getOptions);

// Management actions with granular RBAC checks
router.post('/', authorize('configuration', 'create'), createOption);
router.put('/reorder', authorize('configuration', 'update'), reorderOptions);
router.put('/:id', authorize('configuration', 'update'), updateOption);
router.patch('/:id/toggle', authorize('configuration', 'update'), toggleOptionStatus);
router.delete('/:id', authorize('configuration', 'delete'), deleteOption);

export default router;

