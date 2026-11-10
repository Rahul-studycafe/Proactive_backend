import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../utils/ApiResponse';
import { ApiError } from '../common/errors/api-error';
import { Receipt } from '../models/Receipt';
import { Invoice } from '../models/Invoice';
import {
  createReceiptWithTransaction,
  calculateAutoSettle
} from '../services/receipt.service';
import { notificationDispatcher } from '../services/notifications/notification-dispatcher.service';
import { Client } from '../modules/clients/schemas/client.schema';
import { z } from 'zod';
import mongoose from 'mongoose';

// Validation schemas
const createReceiptSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  date: z.string().optional(),
  paymentMode: z.string().default('Bank Transfer'),
  referenceNumber: z.string().optional(),
  totalAmount: z.number().min(0.01, 'Amount must be greater than zero'),
  tdsAmount: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  notes: z.string().optional(),
  settlements: z
    .array(
      z.object({
        invoiceId: z.string(),
        settledAmount: z.number().min(0.01),
        tdsDeducted: z.number().min(0).optional()
      })
    )
    .optional(),
  autoSettle: z.boolean().optional()
});

const autoSettlePreviewSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  totalAmount: z.number().min(0.01, 'Amount must be greater than zero'),
  tdsAmount: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0)
});

/**
 * Fetch unpaid & partially paid invoices for a client (Phase 44).
 */
export const getUnpaidInvoices = asyncHandler(
  async (req: Request, res: Response) => {
    const clientId = req.query.clientId as string;
    if (!clientId) {
      throw new ApiError(400, 'clientId query parameter is required');
    }

    const invoices = await Invoice.find({
      tenantId: req.tenantId,
      clientId,
      status: { $in: ['Unpaid', 'Partially Paid'] }
    })
      .select('invoiceNo date dueDate totals status')
      .sort({ date: 1, createdAt: 1 })
      .lean();

    sendSuccess(res, 200, 'Success', invoices);
  }
);

/**
 * List receipts with pagination and optional client filter (Phase 44).
 */
export const getReceipts = asyncHandler(
  async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query: any = { tenantId: req.tenantId };
    if (req.query.clientId) query.clientId = req.query.clientId;
    if (req.query.from || req.query.to) {
      query.date = {};
      if (req.query.from) query.date.$gte = new Date(req.query.from as string);
      if (req.query.to) query.date.$lte = new Date(req.query.to as string);
    }

    const [receipts, total] = await Promise.all([
      Receipt.find(query)
        .populate('clientId', 'name clientNumber fileNo')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Receipt.countDocuments(query)
    ]);

    sendSuccess(res, 200, 'Success', {
      receipts,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  }
);

/**
 * Get receipt detail by ID with populated client and settled invoice info (Phase 44).
 */
export const getReceiptById = asyncHandler(
  async (req: Request, res: Response) => {
    const receipt = await Receipt.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    })
      .populate('clientId', 'name clientNumber fileNo pan gstin email mobile address')
      .populate('settlements.invoiceId', 'invoiceNo date dueDate totals status');

    if (!receipt) {
      throw new ApiError(404, 'Receipt not found');
    }

    sendSuccess(res, 200, 'Success', receipt);
  }
);

/**
 * Create a new receipt with ACID transaction settlement (Phase 45 & 46).
 */
export const createReceipt = asyncHandler(
  async (req: Request, res: Response) => {
    const validatedData = createReceiptSchema.parse(req.body);
    const receipt = await createReceiptWithTransaction(
      req.tenantId as mongoose.Types.ObjectId,
      validatedData
    );

    // Notify assigned account managers or admin about payment recorded
    Client.findOne({ _id: validatedData.clientId, tenantId: req.tenantId })
      .select('name assignedUsers')
      .lean()
      .then((clientDoc: any) => {
        if (clientDoc && clientDoc.assignedUsers && clientDoc.assignedUsers.length > 0) {
          notificationDispatcher.dispatch({
            tenantId: req.tenantId as mongoose.Types.ObjectId,
            recipients: clientDoc.assignedUsers.map((uid: any) => ({ userId: uid })),
            eventKey: 'payment:received',
            category: 'billing',
            title: `Payment Recorded: ₹${validatedData.totalAmount}`,
            message: `A payment receipt of ₹${validatedData.totalAmount} (${validatedData.paymentMode}) was recorded for client "${clientDoc.name}".`,
            link: `/billing/receipts`,
            actorId: req.user?._id,
            actorName: req.user?.name,
            metadata: { receiptId: (receipt as any)?._id, clientId: validatedData.clientId, amount: validatedData.totalAmount }
          }).catch(err => console.error('[createReceipt] Notification error:', err));
        }
      })
      .catch(err => console.error('[createReceipt] Client lookup for notification error:', err));

    sendSuccess(res, 201, 'Receipt created successfully', receipt);
  }
);

/**
 * Preview auto-settle FIFO invoice allocations without committing (Phase 46).
 */
export const autoSettlePreview = asyncHandler(
  async (req: Request, res: Response) => {
    const { clientId, totalAmount, tdsAmount, discountAmount } =
      autoSettlePreviewSchema.parse(req.body);

    const result = await calculateAutoSettle(
      req.tenantId as mongoose.Types.ObjectId,
      clientId,
      totalAmount,
      tdsAmount,
      discountAmount
    );

    sendSuccess(res, 200, 'Success', result);
  }
);
