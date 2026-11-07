import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { triggerTasks, getAutomationLogs } from '../controllers/automation.controller';

const router = Router();

router.use(authenticate);

router.post('/trigger-tasks', authorize('automation:run'), triggerTasks);
router.get('/logs', authorize('automation:run'), getAutomationLogs);

export default router;
