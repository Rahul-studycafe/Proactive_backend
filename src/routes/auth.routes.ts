import { Router } from 'express';
import { register, login, refresh, logout, getMe, calculatePriceEndpoint, getPricingTiersEndpoint, sendOtp, verifyOtp, forgotPassword, resetPassword, uploadAvatar, verifyInvite, activateInvite } from '../modules/auth/controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { authRateLimiter } from '../middlewares/rate-limiter';
import { uploadAvatarMiddleware } from '../middlewares/upload';

const router = Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/me/avatar', authenticate, uploadAvatarMiddleware.single('avatar'), uploadAvatar);
router.get('/calculate-price', calculatePriceEndpoint);
router.get('/pricing-tiers', getPricingTiersEndpoint);
router.post('/send-otp', authRateLimiter, sendOtp);
router.post('/verify-otp', authRateLimiter, verifyOtp);
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password', authRateLimiter,  resetPassword);
router.get('/verify-invite', authRateLimiter, verifyInvite);
router.post('/activate-invite', authRateLimiter, activateInvite);
export default router;
