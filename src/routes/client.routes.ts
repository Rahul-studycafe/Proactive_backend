import { Router } from 'express';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  uploadClientPhoto,
  subscribeToPackage,
  subscribeToService
} from '../modules/clients/controllers/client.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { uploadClientMiddleware } from '../middlewares/upload';
import { autoFillClientFromGstin } from '../controllers/compliance.controller';

const router = Router();

// Protect all client routes
router.use(authenticate);

// Upload photo & Auto-fill from GSTIN (must be before /:id)
router.post('/upload-photo', authorize('client', 'create'), uploadClientMiddleware.single('photo'), uploadClientPhoto);
router.post('/auto-fill-from-gstin', authorize('client', 'create'), autoFillClientFromGstin);

// List clients (requires view permission)
router.get('/', authorize('client', 'view'), getClients);

// Get single client (requires view permission)
router.get('/:id', authorize('client', 'view'), getClientById);

// Create client (requires create permission)
router.post('/', authorize('client', 'create'), createClient);

// Update client (requires edit permission)
router.put('/:id', authorize('client', 'edit'), updateClient);

// Subscribe to package (requires edit permission on client)
router.post('/:id/packages', authorize('client', 'edit'), subscribeToPackage);

// Subscribe to service (requires edit permission on client)
router.post('/:id/services', authorize('client', 'edit'), subscribeToService);

// Delete/Disable client (requires delete permission)
router.delete('/:id', authorize('client', 'delete'), deleteClient);

export default router;
