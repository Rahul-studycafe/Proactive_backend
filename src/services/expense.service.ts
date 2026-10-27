import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { Expense, IExpense, ExpensePaymentMode } from '../models/Expense';
import { ExpenseCategory } from '../modules/masters/schemas/expense-category.schema';
import { Client } from '../modules/clients/schemas/client.schema';
import { Task } from '../models/Task';
import { getNextExpenseNumber } from './sequence.service';
import { ApiError } from '../utils/ApiError';

export interface CreateExpenseDTO {
  clientId: string;
  taskId?: string;
  date?: string | Date;
  categoryId: string;
  categoryName?: string;
  amount: number;
  paymentMode: ExpensePaymentMode;
  paidFromAccount?: string;
  notes?: string;
}

export interface UpdateExpenseDTO {
  taskId?: string | null;
  date?: string | Date;
  categoryId?: string;
  categoryName?: string;
  amount?: number;
  paymentMode?: ExpensePaymentMode;
  paidFromAccount?: string;
  notes?: string;
}

export interface ExpenseFilterQuery {
  clientId?: string;
  isBilled?: 'true' | 'false' | 'all' | boolean;
  categoryId?: string;
  paymentMode?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class ExpenseService {
  /**
   * Helper: Ensure standard expense categories exist for tenant
   */
  static async seedDefaultCategories(tenantId: mongoose.Types.ObjectId): Promise<void> {
    const count = await ExpenseCategory.countDocuments({ tenantId });
    if (count === 0) {
      const defaults = [
        'Challan / Tax Paid',
        'Government Stamping / ROC Fees',
        'Court & Legal Fees',
        'Travel & Conveyance',
        'Stationery & Courier',
        'Miscellaneous Outlay'
      ];
      await ExpenseCategory.insertMany(
        defaults.map(name => ({
          tenantId,
          name,
          isActive: true
        }))
      );
    }
  }

  /**
   * Phase 101 & 102: Create new client expense with optional receipt upload
   */
  static async createExpense(
    tenantId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    dto: CreateExpenseDTO,
    file?: Express.Multer.File
  ): Promise<IExpense> {
    // 1. Verify Client exists and belongs to tenant
    const client = await Client.findOne({ _id: dto.clientId, tenantId });
    if (!client) {
      throw new ApiError(404, 'Client not found');
    }

    // 2. Verify Task if specified
    if (dto.taskId) {
      const task = await Task.findOne({ _id: dto.taskId, tenantId });
      if (!task) {
        throw new ApiError(404, 'Linked task not found');
      }
    }

    // 3. Resolve Category
    await this.seedDefaultCategories(tenantId);
    let category = await ExpenseCategory.findOne({ _id: dto.categoryId, tenantId });
    let categoryName = dto.categoryName;
    if (category) {
      categoryName = category.name;
    } else if (!categoryName) {
      // Fallback: look up by name
      category = await ExpenseCategory.findOne({ name: dto.categoryId, tenantId });
      if (category) {
        dto.categoryId = (category._id as mongoose.Types.ObjectId).toString();
        categoryName = category.name;
      } else {
        throw new ApiError(404, 'Expense category not found');
      }
    }

    // 4. Generate sequential expense number (e.g. EXP-001)
    const expenseNo = await getNextExpenseNumber(tenantId);

    // 5. File handling
    let receiptFileUrl: string | undefined;
    let receiptFileName: string | undefined;
    if (file) {
      receiptFileUrl = `/uploads/expenses/${file.filename}`;
      receiptFileName = file.originalname;
    }

    // 6. Create Expense
    const expense = new Expense({
      tenantId,
      clientId: client._id,
      taskId: dto.taskId ? new mongoose.Types.ObjectId(dto.taskId) : undefined,
      expenseNo,
      date: dto.date ? new Date(dto.date) : new Date(),
      categoryId: new mongoose.Types.ObjectId(dto.categoryId),
      categoryName: categoryName || 'Reimbursable Expense',
      amount: dto.amount,
      paymentMode: dto.paymentMode,
      paidFromAccount: dto.paidFromAccount,
      notes: dto.notes,
      receiptFileUrl,
      receiptFileName,
      isBilled: false,
      createdBy: userId
    });

    await expense.save();

    return (await Expense.findById(expense._id)
      .populate('clientId', 'name fileNo pan email mobile')
      .populate('categoryId', 'name')
      .populate('taskId', 'title status')
      .populate('createdBy', 'name email')) as IExpense;
  }

  /**
   * Phase 102: Filterable Expenses Ledger & Financial Aggregates
   */
  static async getExpenses(tenantId: mongoose.Types.ObjectId, query: ExpenseFilterQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: any = { tenantId };

    if (query.clientId) {
      filter.clientId = new mongoose.Types.ObjectId(query.clientId);
    }

    if (query.categoryId) {
      filter.categoryId = new mongoose.Types.ObjectId(query.categoryId);
    }

    if (query.paymentMode) {
      filter.paymentMode = query.paymentMode;
    }

    // Filter billed state
    if (query.isBilled !== undefined && query.isBilled !== 'all') {
      filter.isBilled = query.isBilled === 'true' || query.isBilled === true;
    }

    // Date range filter
    if (query.startDate || query.endDate) {
      filter.date = {};
      if (query.startDate) {
        filter.date.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    // Free text search
    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { expenseNo: searchRegex },
        { categoryName: searchRegex },
        { notes: searchRegex },
        { paidFromAccount: searchRegex }
      ];
    }

    // Execute queries in parallel
    const [expenses, total, summaryAgg] = await Promise.all([
      Expense.find(filter)
        .populate('clientId', 'name fileNo pan email mobile')
        .populate('categoryId', 'name')
        .populate('taskId', 'title status')
        .populate('invoiceId', 'invoiceNo date status')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Expense.countDocuments(filter),
      Expense.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            billedAmount: {
              $sum: { $cond: [{ $eq: ['$isBilled', true] }, '$amount', 0] }
            },
            unbilledAmount: {
              $sum: { $cond: [{ $eq: ['$isBilled', false] }, '$amount', 0] }
            }
          }
        }
      ])
    ]);

    const summary = summaryAgg[0] || { totalAmount: 0, billedAmount: 0, unbilledAmount: 0 };

    return {
      expenses,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1
      },
      summary: {
        totalAmount: summary.totalAmount,
        billedAmount: summary.billedAmount,
        unbilledAmount: summary.unbilledAmount
      }
    };
  }

  /**
   * Phase 102: Get Single Expense Detail
   */
  static async getExpenseById(tenantId: mongoose.Types.ObjectId, expenseId: string): Promise<IExpense> {
    const expense = await Expense.findOne({ _id: expenseId, tenantId })
      .populate('clientId', 'name fileNo pan email mobile')
      .populate('categoryId', 'name')
      .populate('taskId', 'title status')
      .populate('invoiceId', 'invoiceNo date status totals')
      .populate('createdBy', 'name email');

    if (!expense) {
      throw new ApiError(404, 'Expense not found');
    }

    return expense;
  }

  /**
   * Phase 102: Update Expense (Blocked if already billed)
   */
  static async updateExpense(
    tenantId: mongoose.Types.ObjectId,
    expenseId: string,
    dto: UpdateExpenseDTO,
    file?: Express.Multer.File
  ): Promise<IExpense> {
    const expense = await Expense.findOne({ _id: expenseId, tenantId });
    if (!expense) {
      throw new ApiError(404, 'Expense not found');
    }

    // Strict mutation guard: Billed expenses cannot be altered
    if (expense.isBilled) {
      throw new ApiError(400, 'Cannot edit an expense that has already been billed');
    }

    // Update category
    if (dto.categoryId) {
      const category = await ExpenseCategory.findOne({ _id: dto.categoryId, tenantId });
      if (category) {
        expense.categoryId = category._id as mongoose.Types.ObjectId;
        expense.categoryName = category.name;
      }
    } else if (dto.categoryName) {
      expense.categoryName = dto.categoryName;
    }

    // Update task
    if (dto.taskId !== undefined) {
      expense.taskId = dto.taskId ? new mongoose.Types.ObjectId(dto.taskId) : undefined;
    }

    if (dto.date) expense.date = new Date(dto.date);
    if (dto.amount !== undefined) expense.amount = dto.amount;
    if (dto.paymentMode) expense.paymentMode = dto.paymentMode;
    if (dto.paidFromAccount !== undefined) expense.paidFromAccount = dto.paidFromAccount;
    if (dto.notes !== undefined) expense.notes = dto.notes;

    // Handle receipt file update
    if (file) {
      // Unlink previous file if present
      if (expense.receiptFileUrl) {
        const oldFilePath = path.join(process.cwd(), 'public', expense.receiptFileUrl);
        if (fs.existsSync(oldFilePath)) {
          try {
            fs.unlinkSync(oldFilePath);
          } catch (_) {}
        }
      }
      expense.receiptFileUrl = `/uploads/expenses/${file.filename}`;
      expense.receiptFileName = file.originalname;
    }

    await expense.save();

    return this.getExpenseById(tenantId, expenseId);
  }

  /**
   * Phase 102: Delete Expense (Blocked if already billed)
   */
  static async deleteExpense(tenantId: mongoose.Types.ObjectId, expenseId: string): Promise<void> {
    const expense = await Expense.findOne({ _id: expenseId, tenantId });
    if (!expense) {
      throw new ApiError(404, 'Expense not found');
    }

    // Strict deletion guard
    if (expense.isBilled) {
      throw new ApiError(
        400,
        `Cannot delete an expense that has already been billed on invoice ${expense.invoiceId || ''}`
      );
    }

    // Remove physical file if exists
    if (expense.receiptFileUrl) {
      const filePath = path.join(process.cwd(), 'public', expense.receiptFileUrl);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (_) {}
      }
    }

    await Expense.deleteOne({ _id: expenseId, tenantId });
  }

  /**
   * Phase 103: Unbilled Expenses Aggregation for Invoicing Workspace
   */
  static async getUnbilledExpensesForClient(tenantId: mongoose.Types.ObjectId, clientId: string) {
    const client = await Client.findOne({ _id: clientId, tenantId });
    if (!client) {
      throw new ApiError(404, 'Client not found');
    }

    const expenses = await Expense.find({
      tenantId,
      clientId,
      isBilled: false
    })
      .populate('categoryId', 'name')
      .sort({ date: 1, createdAt: 1 });

    const unbilledExpenses = expenses.map(exp => {
      const formattedDate = new Date(exp.date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const noteSuffix = exp.notes ? ` - ${exp.notes}` : '';
      const particulars = `[${exp.categoryName}]${noteSuffix} (${formattedDate})`;

      return {
        _id: exp._id,
        expenseNo: exp.expenseNo,
        date: exp.date,
        categoryId: exp.categoryId,
        categoryName: exp.categoryName,
        amount: exp.amount,
        paymentMode: exp.paymentMode,
        notes: exp.notes,
        particulars,
        referenceType: 'Expense' as const,
        referenceId: exp._id,
        receiptFileUrl: exp.receiptFileUrl
      };
    });

    const totalUnbilledExpensesAmount = unbilledExpenses.reduce((sum, item) => sum + item.amount, 0);

    return {
      unbilledExpenses,
      totalUnbilledExpensesAmount,
      count: unbilledExpenses.length
    };
  }

  /**
   * Phase 105: Practice-Wide Expense Analytics & Outlay KPIs
   */
  static async getExpenseAnalytics(tenantId: mongoose.Types.ObjectId, query?: { startDate?: string; endDate?: string }) {
    const matchFilter: any = { tenantId };

    if (query?.startDate || query?.endDate) {
      matchFilter.date = {};
      if (query.startDate) matchFilter.date.$gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        matchFilter.date.$lte = end;
      }
    }

    const [analytics] = await Expense.aggregate([
      { $match: matchFilter },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalExpenseAmount: { $sum: '$amount' },
                billedExpenseAmount: {
                  $sum: { $cond: [{ $eq: ['$isBilled', true] }, '$amount', 0] }
                },
                unbilledExpenseAmount: {
                  $sum: { $cond: [{ $eq: ['$isBilled', false] }, '$amount', 0] }
                },
                count: { $sum: 1 }
              }
            }
          ],
          byCategory: [
            {
              $group: {
                _id: '$categoryName',
                totalAmount: { $sum: '$amount' },
                billedAmount: {
                  $sum: { $cond: [{ $eq: ['$isBilled', true] }, '$amount', 0] }
                },
                unbilledAmount: {
                  $sum: { $cond: [{ $eq: ['$isBilled', false] }, '$amount', 0] }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { totalAmount: -1 } }
          ],
          monthlyTrends: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
                totalAmount: { $sum: '$amount' },
                billedAmount: {
                  $sum: { $cond: [{ $eq: ['$isBilled', true] }, '$amount', 0] }
                },
                unbilledAmount: {
                  $sum: { $cond: [{ $eq: ['$isBilled', false] }, '$amount', 0] }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ]);

    const rawOverview = analytics?.overview?.[0] || {
      totalExpenseAmount: 0,
      billedExpenseAmount: 0,
      unbilledExpenseAmount: 0,
      count: 0
    };

    const recoveryRatePercentage =
      rawOverview.totalExpenseAmount > 0
        ? Math.round((rawOverview.billedExpenseAmount / rawOverview.totalExpenseAmount) * 100)
        : 0;

    return {
      overview: {
        totalExpenseAmount: rawOverview.totalExpenseAmount,
        billedExpenseAmount: rawOverview.billedExpenseAmount,
        unbilledExpenseAmount: rawOverview.unbilledExpenseAmount,
        recoveryRatePercentage,
        count: rawOverview.count
      },
      byCategory: analytics?.byCategory || [],
      monthlyTrends: analytics?.monthlyTrends || []
    };
  }
}
