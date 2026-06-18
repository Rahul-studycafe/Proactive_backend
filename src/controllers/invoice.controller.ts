import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { Invoice } from '../models/Invoice';
import { Task } from '../models/Task';
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

export const createInvoice = asyncHandler(async (req: Request, res: Response) => {
  const data = createInvoiceSchema.parse(req.body);

  // Generate sequence number
  const invoiceNo = await getNextInvoiceNumber(req.tenantId as mongoose.Types.ObjectId, 'INV-');

  // Calculate totals
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTaxable = 0;
  let totalGst = 0;

  const processedItems = data.items.map(item => {
    const itemSubtotal = item.quantity * item.rate;
    const itemDiscount = item.discount;
    const taxableAmount = itemSubtotal - itemDiscount;
    const gstAmount = (taxableAmount * item.gstPercentage) / 100;
    const total = taxableAmount + gstAmount;

    subtotal += itemSubtotal;
    totalDiscount += itemDiscount;
    totalTaxable += taxableAmount;
    totalGst += gstAmount;

    return {
      ...item,
      taxableAmount,
      gstAmount,
      total
    };
  });

  const grandTotalRaw = totalTaxable + totalGst;
  const grandTotal = Math.round(grandTotalRaw);
  const roundOff = grandTotal - grandTotalRaw;

  const totals = {
    subtotal,
    totalDiscount,
    totalTaxable,
    totalGst,
    roundOff,
    grandTotal,
    amountPaid: 0,
    amountDue: grandTotal
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

export const updateInvoice = asyncHandler(async (req: Request, res: Response) => {
  // Only drafts can be fully updated safely without complex reversal logic
  const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invoice) throw new ApiError(404, 'Invoice not found');

  if (invoice.status !== 'Draft') {
    throw new ApiError(400, 'Only Draft invoices can be modified directly');
  }

  // Similar logic as createInvoice would go here for recalculation...
  // For the MVP, we might only allow updating basic fields on Drafts or just recommend cancel + recreate.
  
  sendSuccess(res, 200, 'Not implemented for MVP yet', {});
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
  await invoice.save(); // Crucial to use .save() so we can trigger hooks if needed, but wait:

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

  sendSuccess(res, 200, 'Invoice cancelled', invoice);
});
