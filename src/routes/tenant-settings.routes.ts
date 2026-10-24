import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import {
  getWorkingDays,
  updateWorkingDays,
  getMyIp
} from '../controllers/tenant-settings.controller';

const router = Router();

router.use(authenticate);

router.get('/work-days', getWorkingDays);
router.put('/work-days', updateWorkingDays);
router.get('/my-ip', getMyIp);

export default router;
