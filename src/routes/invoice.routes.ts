import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  getUnbilledTasks,
  getUnbilledExpenses,
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  cancelInvoice
} from '../controllers/invoice.controller';
import {
  getInvoiceUpiQr,
  createInvoicePaymentLink
} from '../controllers/payment-gateway.controller';

const router = Router();

router.use(authenticate);

// Billing prep endpoints (requires invoice create/view)
router.get('/unbilled/:clientId', authorize('invoice', 'create'), getUnbilledTasks);
router.get('/unbilled-tasks/:clientId', authorize('invoice', 'create'), getUnbilledTasks);
router.get('/unbilled-expenses/:clientId', authorize('invoice', 'create'), getUnbilledExpenses);

// Payment & Dynamic UPI QR (Phase 132)
router.get('/:id/upi-qr', authorize('invoice', 'view'), getInvoiceUpiQr);
router.post('/:id/payment-link', authorize('invoice', 'edit'), createInvoicePaymentLink);

// Invoice CRUD
router.post('/', authorize('invoice', 'create'), createInvoice);
router.get('/', authorize('invoice', 'view'), getInvoices);
router.get('/:id', authorize('invoice', 'view'), getInvoiceById);
router.put('/:id', authorize('invoice', 'edit'), updateInvoice);
router.delete('/:id', authorize('invoice', 'delete'), cancelInvoice);

export default router;
