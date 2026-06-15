import { Router } from 'express';
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService
} from '../modules/services/controllers/service.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

// Protect all service routes
router.use(authenticate);

// List services
router.get('/', authorize('settings', 'manageMasters'), getServices);

// Get single service
router.get('/:id', authorize('settings', 'manageMasters'), getServiceById);

// Create service
router.post('/', authorize('settings', 'manageMasters'), createService);

// Update service
router.put('/:id', authorize('settings', 'manageMasters'), updateService);

// Delete/Disable service
router.delete('/:id', authorize('settings', 'manageMasters'), deleteService);

export default router;
