import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  createPackage,
  getPackages,
  getPackageById,
  updatePackage,
  deletePackage
} from '../modules/services/controllers/package.controller';

const router = Router();

// Protect all package routes
router.use(authenticate);

router.post('/', authorize('package', 'create'), createPackage);
router.get('/', authorize('package', 'view'), getPackages);
router.get('/:id', authorize('package', 'view'), getPackageById);
router.put('/:id', authorize('package', 'edit'), updatePackage);
router.delete('/:id', authorize('package', 'delete'), deletePackage);

export default router;
