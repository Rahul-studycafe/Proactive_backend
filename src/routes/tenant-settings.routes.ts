import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import {
  getWorkingDays,
  updateWorkingDays,
  getMyIp,
  getBillingEntities,
  createBillingEntity
} from '../controllers/tenant-settings.controller';

const router = Router();

router.use(authenticate);

router.get('/work-days', getWorkingDays);
router.put('/work-days', updateWorkingDays);
router.get('/my-ip', getMyIp);

// Phase 119: Multi-Billing Entity Management
router.get('/billing-entities', getBillingEntities);
router.post('/billing-entities', createBillingEntity);

export default router;
