import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import {
  getClientDistribution,
  getStaffPerformance,
  getAttendanceOverview
} from '../controllers/analytics.controller';
import { getExpenseAnalytics } from '../controllers/expense.controller';
import { getQuotationPipelineAnalytics } from '../controllers/quotation.controller';

const router = Router();

router.use(authenticate);

router.get('/client-distribution', getClientDistribution);
router.get('/staff-performance', getStaffPerformance);
router.get('/attendance-overview', getAttendanceOverview);
router.get('/expenses', getExpenseAnalytics);
router.get('/quotation-pipeline', getQuotationPipelineAnalytics);

export default router;
