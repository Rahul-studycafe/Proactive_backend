import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import {
  getClientDistribution,
  getStaffPerformance,
  getAttendanceOverview
} from '../controllers/analytics.controller';

const router = Router();

router.use(authenticate);

router.get('/client-distribution', getClientDistribution);
router.get('/staff-performance', getStaffPerformance);
router.get('/attendance-overview', getAttendanceOverview);

export default router;
