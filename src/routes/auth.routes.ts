import { Router } from 'express';
import { register, login, refresh, logout, getMe, calculatePriceEndpoint, getPricingTiersEndpoint, sendOtp, verifyOtp, forgotPassword, resetPassword } from '../modules/auth/controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { authRateLimiter } from '../middlewares/rate-limiter';

const router = Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.get('/me', authenticate, getMe);
router.get('/calculate-price', calculatePriceEndpoint);
router.get('/pricing-tiers', getPricingTiersEndpoint);
router.post('/send-otp', authRateLimiter, sendOtp);
router.post('/verify-otp', authRateLimiter, verifyOtp);
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password', authRateLimiter,  resetPassword);
export default router;
