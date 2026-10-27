import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { getUnbilledTasks, getUnbilledExpenses } from '../controllers/invoice.controller';

const router = Router();

router.use(authenticate);

// Billing prep endpoints for invoice workspace
router.get('/unbilled-tasks/:clientId', authorize('invoice', 'create'), getUnbilledTasks);
router.get('/unbilled-expenses/:clientId', authorize('invoice', 'create'), getUnbilledExpenses);
router.get('/unbilled/:clientId', authorize('invoice', 'create'), getUnbilledTasks);

export default router;
