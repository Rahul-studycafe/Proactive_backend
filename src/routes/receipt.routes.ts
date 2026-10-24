import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  getUnpaidInvoices,
  getReceipts,
  getReceiptById,
  createReceipt,
  autoSettlePreview
} from '../controllers/receipt.controller';

const router = Router();

router.use(authenticate);

// Specific sub-paths first to avoid conflict with /:id
router.get('/unpaid-invoices', authorize('receipt', 'create'), getUnpaidInvoices);
router.post('/auto-settle-preview', authorize('receipt', 'create'), autoSettlePreview);

// Receipt CRUD
router.post('/', authorize('receipt', 'create'), createReceipt);
router.get('/', authorize('receipt', 'view'), getReceipts);
router.get('/:id', authorize('receipt', 'view'), getReceiptById);

export default router;
