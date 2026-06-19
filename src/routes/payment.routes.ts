import { Router } from 'express';
import { getPricing, createOrder, verifyPayment } from '../controllers/payment.controller';
import { authenticate } from '../middlewares/authenticate';

const router = Router();

// Public routes
router.get('/pricing', getPricing);
router.post('/verify', verifyPayment);

// Protected routes (user must be logged in to create order)
router.post('/create-order', authenticate, createOrder);

export default router;
