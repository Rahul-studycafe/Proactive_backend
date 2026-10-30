import { Router } from 'express';
import { handleClientPaymentWebhook, getPaymentTransactions } from '../controllers/payment-gateway.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

// Public webhook receiver (Phase 133 & 134)
router.post('/webhook', handleClientPaymentWebhook);

// Protected transactions audit routes (Phase 135)
router.use(authenticate);
router.get('/transactions', authorize('invoice', 'view'), getPaymentTransactions);

export default router;

