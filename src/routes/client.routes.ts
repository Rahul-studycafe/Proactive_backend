import { Router } from 'express';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  uploadClientPhoto,
  subscribeToPackage,
  subscribeToService,
  unsubscribeFromPackage,
  unsubscribeFromService,
} from '../modules/clients/controllers/client.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { uploadClientMiddleware } from '../middlewares/upload';
import { autoFillClientFromGstin } from '../controllers/compliance.controller';
import { checkClientLimit } from '../middlewares/plan-guard';
import {
  getClientPortalUsers,
  createClientPortalUser,
  updateClientPortalUser,
  deleteClientPortalUser,
  resetClientPortalUserPassword,
  toggleClientPortalAccess
} from '../controllers/client-portal-users.controller';

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
router.post('/', authorize('client', 'create'), checkClientLimit, createClient);

// Update client (requires edit permission)
router.put('/:id', authorize('client:edit'), updateClient);

// Subscribe to package (requires edit permission on client)
router.post('/:id/packages', authorize(['client:packages_manage', 'client:edit']), subscribeToPackage);
router.delete('/:id/packages/:packageId', authorize(['client:packages_manage', 'client:edit']), unsubscribeFromPackage);

// Subscribe to service (requires edit permission on client)
router.post('/:id/services', authorize(['client:services_manage', 'client:edit']), subscribeToService);
router.delete('/:id/services/:serviceId', authorize(['client:services_manage', 'client:edit']), unsubscribeFromService);

// Client Portal Access & Users Management
router.get('/:id/portal-users', authorize(['client:portal_manage', 'client:view', 'client:edit']), getClientPortalUsers);
router.post('/:id/portal-users', authorize(['client:portal_manage', 'client:edit']), createClientPortalUser);
router.put('/:id/portal-users/:userId', authorize(['client:portal_manage', 'client:edit']), updateClientPortalUser);
router.delete('/:id/portal-users/:userId', authorize(['client:portal_manage', 'client:edit']), deleteClientPortalUser);
router.post('/:id/portal-users/:userId/reset-password', authorize(['client:portal_manage', 'client:edit']), resetClientPortalUserPassword);
router.patch('/:id/portal-access', authorize(['client:portal_manage', 'client:edit']), toggleClientPortalAccess);

// Delete/Disable client (requires delete permission)
router.delete('/:id', authorize('client:delete'), deleteClient);

export default router;
