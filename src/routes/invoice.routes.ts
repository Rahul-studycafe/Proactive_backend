import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  getUnbilledTasks,
  createInvoice,
  getInvoices,
  updateInvoice,
  cancelInvoice
} from '../controllers/invoice.controller';

const router = Router();

router.use(authenticate);

// Billing prep endpoints (requires invoice create/view)
router.get('/unbilled/:clientId', authorize('invoice', 'create'), getUnbilledTasks);

// Invoice CRUD
router.post('/', authorize('invoice', 'create'), createInvoice);
router.get('/', authorize('invoice', 'view'), getInvoices);
router.put('/:id', authorize('invoice', 'edit'), updateInvoice);
router.delete('/:id', authorize('invoice', 'delete'), cancelInvoice);

export default router;
