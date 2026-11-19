import { Router } from 'express';
import { register, login, refresh, logout, getMe, updateMe, requestEmailChange, verifyEmailChange, calculatePriceEndpoint, getPricingTiersEndpoint, sendOtp, verifyOtp, forgotPassword, resetPassword, uploadAvatar, deleteAvatar, changePassword, verifyInvite, activateInvite } from '../modules/auth/controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { authRateLimiter } from '../middlewares/rate-limiter';
import { uploadAvatarMiddleware } from '../middlewares/upload';

const router = Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateMe);
router.post('/me/request-email-change', authenticate, authRateLimiter, requestEmailChange);
router.post('/me/verify-email-change', authenticate, authRateLimiter, verifyEmailChange);
router.post('/me/avatar', authenticate, uploadAvatarMiddleware.single('avatar'), uploadAvatar);
router.delete('/me/avatar', authenticate, deleteAvatar);
router.put('/me/password', authenticate, changePassword);
router.get('/calculate-price', calculatePriceEndpoint);
router.get('/pricing-tiers', getPricingTiersEndpoint);
router.post('/send-otp', authRateLimiter, sendOtp);
router.post('/verify-otp', authRateLimiter, verifyOtp);
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password', authRateLimiter,  resetPassword);
router.get('/verify-invite', authRateLimiter, verifyInvite);
router.post('/activate-invite', authRateLimiter, activateInvite);
export default router;
