import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { uploadExpenseReceiptMiddleware } from '../middlewares/upload';
import {
  createExpense,
  getExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  getUnbilledExpenses,
  getExpenseAnalytics
} from '../controllers/expense.controller';

const router = Router();

router.use(authenticate);

// Analytics & unbilled shortcuts
router.get('/analytics', authorize('expense', 'view'), getExpenseAnalytics);
router.get('/unbilled/:clientId', authorize('expense', 'view'), getUnbilledExpenses);

// CRUD
router.post(
  '/',
  authorize('expense', 'create'),
  uploadExpenseReceiptMiddleware.single('receipt'),
  createExpense
);

router.get('/', authorize('expense', 'view'), getExpenses);
router.get('/:id', authorize('expense', 'view'), getExpenseById);

router.put(
  '/:id',
  authorize('expense', 'edit'),
  uploadExpenseReceiptMiddleware.single('receipt'),
  updateExpense
);

router.delete('/:id', authorize('expense', 'delete'), deleteExpense);

export default router;
