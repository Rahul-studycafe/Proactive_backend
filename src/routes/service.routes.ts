import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService
} from '../controllers/service.controller';

const router = Router();

// Protect all service routes
router.use(authenticate);

// Since services are system blueprints, they typically fall under settings/masters or a dedicated service module.
// We use settings.manageMasters as per architecture for Service blueprints
router.use(authorize('settings', 'manageMasters'));

// List services
router.get('/', getServices);

// Get single service
router.get('/:id', getServiceById);

// Create service
router.post('/', createService);

// Update service
router.put('/:id', updateService);

// Delete/Disable service
router.delete('/:id', deleteService);

export default router;
