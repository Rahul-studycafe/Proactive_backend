import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  getDashboardOverview,
  getClientSummary
} from '../controllers/dashboard.controller';

const router = Router();

router.use(authenticate);

// Aggregated Dashboard Overview (Phase 48)
router.get('/overview', getDashboardOverview);

// Client-specific Facet Summary (Phase 48 & Requirement 6.8)
router.get('/clients/:id/summary', authorize('client', 'view'), getClientSummary);

export default router;
