import { Router } from 'express';
import { register, login, refresh, logout, getMe } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { authRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

export default router;
