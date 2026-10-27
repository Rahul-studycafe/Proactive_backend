import { Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { ExpenseService } from '../services/expense.service';

const createExpenseSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  taskId: z.string().optional(),
  date: z.string().optional(),
  categoryId: z.string().min(1, 'Category ID is required'),
  categoryName: z.string().optional(),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than zero'),
  paymentMode: z.enum(['Bank Transfer', 'Cash', 'UPI', 'Credit Card', 'Cheque']).default('Bank Transfer'),
  paidFromAccount: z.string().optional(),
  notes: z.string().optional()
});

const updateExpenseSchema = z.object({
  taskId: z.string().nullable().optional(),
  date: z.string().optional(),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than zero').optional(),
  paymentMode: z.enum(['Bank Transfer', 'Cash', 'UPI', 'Credit Card', 'Cheque']).optional(),
  paidFromAccount: z.string().optional(),
  notes: z.string().optional()
});

export const createExpense = asyncHandler(async (req: Request, res: Response) => {
  const data = createExpenseSchema.parse(req.body);

  const expense = await ExpenseService.createExpense(
    req.tenantId as mongoose.Types.ObjectId,
    req.user!._id as mongoose.Types.ObjectId,
    data,
    req.file
  );

  sendSuccess(res, 201, 'Expense created successfully', expense);
});

export const getExpenses = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    clientId: req.query.clientId as string | undefined,
    isBilled: req.query.isBilled as any,
    categoryId: req.query.categoryId as string | undefined,
    paymentMode: req.query.paymentMode as string | undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    search: req.query.search as string | undefined,
    page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10
  };

  const result = await ExpenseService.getExpenses(req.tenantId as mongoose.Types.ObjectId, query);
  sendSuccess(res, 200, 'Expenses retrieved successfully', result);
});

export const getExpenseById = asyncHandler(async (req: Request, res: Response) => {
  const expenseId = req.params.id as string;
  const expense = await ExpenseService.getExpenseById(req.tenantId as mongoose.Types.ObjectId, expenseId);
  sendSuccess(res, 200, 'Expense details retrieved successfully', expense);
});

export const updateExpense = asyncHandler(async (req: Request, res: Response) => {
  const expenseId = req.params.id as string;
  const data = updateExpenseSchema.parse(req.body);

  const expense = await ExpenseService.updateExpense(
    req.tenantId as mongoose.Types.ObjectId,
    expenseId,
    data,
    req.file
  );

  sendSuccess(res, 200, 'Expense updated successfully', expense);
});

export const deleteExpense = asyncHandler(async (req: Request, res: Response) => {
  const expenseId = req.params.id as string;
  await ExpenseService.deleteExpense(req.tenantId as mongoose.Types.ObjectId, expenseId);
  sendSuccess(res, 200, 'Expense deleted successfully', { deleted: true });
});

export const getUnbilledExpenses = asyncHandler(async (req: Request, res: Response) => {
  const clientId = req.params.clientId as string;
  if (!clientId) {
    throw new ApiError(400, 'Client ID is required');
  }

  const result = await ExpenseService.getUnbilledExpensesForClient(
    req.tenantId as mongoose.Types.ObjectId,
    clientId
  );

  sendSuccess(res, 200, 'Unbilled expenses retrieved successfully', result);
});

export const getExpenseAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined
  };

  const analytics = await ExpenseService.getExpenseAnalytics(
    req.tenantId as mongoose.Types.ObjectId,
    query
  );

  sendSuccess(res, 200, 'Expense analytics retrieved successfully', analytics);
});
