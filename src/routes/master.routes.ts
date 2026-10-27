import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { ApiError } from '../common/errors/api-error';
import {
  tagController,
  clientGroupController,
  paymentModeController,
  expenseCategoryController,
  documentTypeController,
  holidayController,
  settingsController,
  billingEntityController,
  getBootstrap
} from '../modules/masters/controllers/master.controller';

const router = Router();

// Protect all master routes
router.use(authenticate);

// Phase 25: Bootstrap Endpoint (Aggregated payload for initial load)
// Public to any authenticated user
router.get('/bootstrap', getBootstrap);

// Ensure settings/masters management permission for the rest
router.use(authorize('settings', 'manageMasters'));

// Setup generic CRUD routes helper
const setupCrudRoutes = (path: string, controller: any) => {
  router.get(path, controller.getAll);
  router.post(path, controller.create);
  router.put(`${path}/:id`, controller.update);
  router.delete(`${path}/:id`, controller.delete);
};

// Phase 22: Master Models 1 (Tags & ClientGroups)
setupCrudRoutes('/tags', tagController);
setupCrudRoutes('/client-groups', clientGroupController);

// Phase 23: Master Models 2 (PaymentModes & ExpenseCategories)
setupCrudRoutes('/payment-modes', paymentModeController);
setupCrudRoutes('/expense-categories', expenseCategoryController);

// Phase 24: Master Models 3 (Holidays & DocumentTypes)
setupCrudRoutes('/holidays', holidayController);
setupCrudRoutes('/document-types', documentTypeController);

// Phase 26: Tenant Settings & Custom Fields
router.get('/settings', settingsController.getSettings);
router.put('/settings', settingsController.updateSettings);

router.post('/settings/client-custom-fields', settingsController.addCustomField);
router.put('/settings/client-custom-fields/:index', settingsController.updateCustomField);
router.delete('/settings/client-custom-fields/:index', settingsController.deleteCustomField);

// Phase 119: Generic Master Taxonomy Creation
router.post('/:type', (req, res, next) => {
  const { type } = req.params;
  switch (type) {
    case 'tags':
      return tagController.create(req, res, next);
    case 'client-groups':
      return clientGroupController.create(req, res, next);
    case 'expense-categories':
      return expenseCategoryController.create(req, res, next);
    case 'document-types':
      return documentTypeController.create(req, res, next);
    case 'payment-modes':
      return paymentModeController.create(req, res, next);
    default:
      return next(new ApiError(400, `Unknown taxonomy master type: ${type}`, 'INVALID_MASTER_TYPE'));
  }
});

// Billing Entity
router.get('/billing-entity', billingEntityController.getPrimary);
router.put('/billing-entity', billingEntityController.updatePrimary);

export default router;
