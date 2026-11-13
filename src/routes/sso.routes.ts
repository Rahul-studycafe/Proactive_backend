import { Router } from 'express';
import { createTicketHandler, exchangeTicketHandler, updateOrganizationHandler } from '../controllers/sso.controller';
import { authRateLimiter } from '../middlewares/rate-limiter';
import { authenticate } from '../middlewares/authenticate';

const router = Router();

// Server-to-server endpoint for external platforms (protected by client credentials)
router.post('/ticket', authRateLimiter, createTicketHandler);

// Public browser callback endpoint to exchange single-use ticket for PMS session tokens
router.post('/exchange', authRateLimiter, exchangeTicketHandler);

// Authenticated endpoint to update organization name during/after SSO onboarding
router.put('/organization', authenticate, updateOrganizationHandler);

export default router;

