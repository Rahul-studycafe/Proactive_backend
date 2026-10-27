import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { Invoice } from '../models/Invoice';
import { Task } from '../models/Task';
import { Expense } from '../models/Expense';
import { ExpenseService } from '../services/expense.service';
import { getNextInvoiceNumber } from '../services/sequence.service';
import { z } from 'zod';
import mongoose from 'mongoose';

// Validation schemas
const invoiceItemSchema = z.object({
  referenceType: z.enum(['Task', 'Expense', 'Manual']),
  referenceId: z.string().optional(),
  particulars: z.string().min(1),
  sacCode: z.string().optional(),
  quantity: z.number().min(0.01).default(1),
  rate: z.number().min(0),
  discount: z.number().min(0).default(0),
  gstPercentage: z.number().min(0).default(18)
});

const createInvoiceSchema = z.object({
  clientId: z.string(),
  billingEntityId: z.string().optional(),
  date: z.string(),
  dueDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1),
  status: z.enum(['Draft', 'Unpaid']).default('Unpaid'),
  notes: z.string().optional(),
  termsAndConditions: z.string().optional()
});

export const getUnbilledTasks = asyncHandler(async (req: Request, res: Response) => {
  const { clientId } = req.params;
  
  const unbilledTasks = await Task.find({
    tenantId: req.tenantId,
    clientId,
    status: 'Completed',
    isBilled: false
  }).select('title description billingAmount serviceId completedAt');

  sendSuccess(res, 200, 'Success', unbilledTasks);
});

export const getUnbilledExpenses = asyncHandler(async (req: Request, res: Response) => {
  const clientId = req.params.clientId as string;
  const result = await ExpenseService.getUnbilledExpensesForClient(
    req.tenantId as mongoose.Types.ObjectId,
    clientId
  );
  sendSuccess(res, 200, 'Success', result);
});

// ─── Shared helper: calculate line-item totals ──────────────────
function calculateItemTotals(items: z.infer<typeof invoiceItemSchema>[]) {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTaxable = 0;
  let totalGst = 0;

  const processedItems = items.map(item => {
    const itemSubtotal = item.quantity * item.rate;
    const itemDiscount = item.discount;
    const taxableAmount = itemSubtotal - itemDiscount;
    const gstAmount = (taxableAmount * item.gstPercentage) / 100;
    const total = taxableAmount + gstAmount;

    subtotal += itemSubtotal;
    totalDiscount += itemDiscount;
    totalTaxable += taxableAmount;
    totalGst += gstAmount;

    return { ...item, taxableAmount, gstAmount, total };
  });

  const grandTotalRaw = totalTaxable + totalGst;
  const grandTotal = Math.round(grandTotalRaw);
  const roundOff = grandTotal - grandTotalRaw;

  return {
    processedItems,
    totals: { subtotal, totalDiscount, totalTaxable, totalGst, roundOff, grandTotal }
  };
}

export const createInvoice = asyncHandler(async (req: Request, res: Response) => {
  const data = createInvoiceSchema.parse(req.body);

  // Validate referenced tasks and expenses
  const expenseItemIds = data.items
    .filter(i => i.referenceType === 'Expense' && i.referenceId)
    .map(i => i.referenceId as string);

  if (expenseItemIds.length > 0) {
    const alreadyBilledExpenses = await Expense.find({
      _id: { $in: expenseItemIds },
      tenantId: req.tenantId,
      isBilled: true
    });

    if (alreadyBilledExpenses.length > 0) {
      throw new ApiError(409, 'One or more selected expenses have already been billed on another invoice');
    }
  }

  // Generate sequence number
  const invoiceNo = await getNextInvoiceNumber(req.tenantId as mongoose.Types.ObjectId, 'INV-');

  const { processedItems, totals: calcTotals } = calculateItemTotals(data.items);

  const totals = {
    ...calcTotals,
    amountPaid: 0,
    amountDue: calcTotals.grandTotal
  };

  const invoice = new Invoice({
    tenantId: req.tenantId,
    invoiceNo,
    ...data,
    items: processedItems,
    totals
  });

  await invoice.save();

  sendSuccess(res, 201, 'Invoice created successfully', invoice);
});

export const getInvoices = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const query: any = { tenantId: req.tenantId };
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.status) query.status = req.query.status;

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .populate('clientId', 'name fileNo')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(query)
  ]);

  sendSuccess(res, 200, 'Success', {
    invoices,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  });
});

export const getInvoiceById = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId })
    .populate(
      'clientId',
      'name fileNo pan gstin email mobile secondaryMobile address city state pincode entityType contactPersonName'
    )
    .populate('billingEntityId');
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  sendSuccess(res, 200, 'Success', invoice);
});

export const updateInvoice = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invoice) throw new ApiError(404, 'Invoice not found');

  if (invoice.status !== 'Draft') {
    throw new ApiError(400, 'Only Draft invoices can be modified directly');
  }

  const updateSchema = createInvoiceSchema.partial();
  const data = updateSchema.parse(req.body);

  // If items are being replaced, un-bill old task references first
  if (data.items) {
    const oldTaskIds = invoice.items
      .filter(i => i.referenceType === 'Task' && i.referenceId)
      .map(i => i.referenceId as mongoose.Types.ObjectId);

    if (oldTaskIds.length > 0) {
      await Task.updateMany(
        { _id: { $in: oldTaskIds } },
        { $set: { isBilled: false }, $unset: { invoiceId: 1 } }
      );
    }

    const oldExpenseIds = invoice.items
      .filter(i => i.referenceType === 'Expense' && i.referenceId)
      .map(i => i.referenceId as mongoose.Types.ObjectId);

    if (oldExpenseIds.length > 0) {
      await Expense.updateMany(
        { _id: { $in: oldExpenseIds } },
        { $set: { isBilled: false, billedAt: null }, $unset: { invoiceId: 1 } }
      );
    }

    // Recalculate with new items
    const { processedItems, totals: calcTotals } = calculateItemTotals(data.items);

    invoice.items = processedItems as any;
    invoice.totals = {
      ...calcTotals,
      amountPaid: invoice.totals.amountPaid,
      amountDue: calcTotals.grandTotal - invoice.totals.amountPaid
    };
  }

  // Update allowed top-level fields
  if (data.clientId) invoice.clientId = new mongoose.Types.ObjectId(data.clientId);
  if (data.date) invoice.date = new Date(data.date);
  if (data.dueDate) invoice.dueDate = new Date(data.dueDate);
  if (data.paymentTerms !== undefined) invoice.paymentTerms = data.paymentTerms;
  if (data.notes !== undefined) invoice.notes = data.notes;
  if (data.termsAndConditions !== undefined) invoice.termsAndConditions = data.termsAndConditions;
  if (data.billingEntityId) invoice.billingEntityId = new mongoose.Types.ObjectId(data.billingEntityId);
  if (data.status) invoice.status = data.status; // Draft → Unpaid transition allowed

  await invoice.save(); // Post-save hook auto-bills tasks & expenses if status !== Draft/Cancelled

  sendSuccess(res, 200, 'Invoice updated successfully', invoice);
});

export const cancelInvoice = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invoice) throw new ApiError(404, 'Invoice not found');

  if (invoice.status === 'Cancelled') {
    throw new ApiError(400, 'Invoice is already cancelled');
  }

  if (invoice.status === 'Paid' || invoice.status === 'Partially Paid') {
    throw new ApiError(400, 'Cannot cancel an invoice with payments applied');
  }

  invoice.status = 'Cancelled';
  invoice.totals.amountDue = 0;
  await invoice.save();

  // Un-bill associated tasks
  const taskIds = invoice.items
    .filter(i => i.referenceType === 'Task' && i.referenceId)
    .map(i => i.referenceId as mongoose.Types.ObjectId);
  
  if (taskIds.length > 0) {
    await Task.updateMany(
      { _id: { $in: taskIds } },
      { $set: { isBilled: false }, $unset: { invoiceId: 1 } }
    );
  }

  // Un-bill associated expenses
  const expenseIds = invoice.items
    .filter(i => i.referenceType === 'Expense' && i.referenceId)
    .map(i => i.referenceId as mongoose.Types.ObjectId);

  if (expenseIds.length > 0) {
    await Expense.updateMany(
      { _id: { $in: expenseIds } },
      { $set: { isBilled: false, billedAt: null }, $unset: { invoiceId: 1 } }
    );
  }

  sendSuccess(res, 200, 'Invoice cancelled', invoice);
});
