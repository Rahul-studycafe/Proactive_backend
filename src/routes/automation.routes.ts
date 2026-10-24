import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { triggerTasks, getAutomationLogs } from '../controllers/automation.controller';

const router = Router();

router.use(authenticate);

router.post('/trigger-tasks', triggerTasks);
router.get('/logs', getAutomationLogs);

export default router;
