import { Router } from 'express';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient
} from '../modules/clients/controllers/client.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

// Protect all client routes
router.use(authenticate);

// List clients (requires view permission)
router.get('/', authorize('client', 'view'), getClients);

// Get single client (requires view permission)
router.get('/:id', authorize('client', 'view'), getClientById);

// Create client (requires create permission)
router.post('/', authorize('client', 'create'), createClient);

// Update client (requires edit permission)
router.put('/:id', authorize('client', 'edit'), updateClient);

// Delete/Disable client (requires delete permission)
router.delete('/:id', authorize('client', 'delete'), deleteClient);

export default router;
