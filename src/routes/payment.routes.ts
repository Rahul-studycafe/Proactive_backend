import { Router } from 'express';
import { getPricing, createOrder, verifyPayment, handleRazorpayWebhook } from '../controllers/payment.controller';
import { authenticate } from '../middlewares/authenticate';

const router = Router();

// Public routes
router.get('/pricing', getPricing);
router.post('/verify', verifyPayment);
router.post('/webhook', handleRazorpayWebhook);

// Protected routes (user must be logged in to create order)
router.post('/create-order', authenticate, createOrder);

export default router;
