import { Router } from 'express';
import { register, login, refresh, logout, getMe, calculatePriceEndpoint, sendOtp, verifyOtp } from '../modules/auth/controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { authRateLimiter } from '../middlewares/rate-limiter';

const router = Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.get('/calculate-price', calculatePriceEndpoint);
router.post('/send-otp', authRateLimiter, sendOtp);
router.post('/verify-otp', authRateLimiter, verifyOtp);
export default router;
