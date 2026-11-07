import { Router } from 'express';
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getServiceClients
} from '../modules/services/controllers/service.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

// Protect all service routes
router.use(authenticate);

// List services
router.get('/', authorize('service:view'), getServices);

// Get single service
router.get('/:id', authorize('service:view'), getServiceById);

// Get clients subscribed to service
router.get('/:id/clients', authorize('service:view'), getServiceClients);

// Create service
router.post('/', authorize('service:create'), createService);

// Update service
router.put('/:id', authorize('service:edit'), updateService);

// Delete/Disable service
router.delete('/:id', authorize('service:delete'), deleteService);

export default router;
