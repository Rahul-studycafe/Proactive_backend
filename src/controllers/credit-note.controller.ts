import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  createCreditNoteService,
  getCreditNoteListService,
  getCreditNoteByIdService,
  applyUnallocatedCreditService,
  refundCreditNoteService
} from '../services/credit-note.service';
import { CREDIT_NOTE_REASONS } from '../models/CreditNote';

const createCreditNoteSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  invoiceId: z.string().min(1, 'Invoice ID is required'),
  date: z.string().min(1, 'Date is required'),
  reason: z.enum(CREDIT_NOTE_REASONS).optional(),
  items: z.array(
    z.object({
      description: z.string().min(1, 'Item description is required'),
      sacCode: z.string().optional(),
      quantity: z.number().min(0.01, 'Quantity must be positive'),
      rate: z.number().min(0, 'Rate cannot be negative'),
      amount: z.number().optional(),
      gstPercentage: z.number().optional(),
      cgst: z.number().optional(),
      sgst: z.number().optional(),
      igst: z.number().optional(),
      total: z.number().optional()
    })
  ).min(1, 'At least one line item is required'),
  totals: z.object({
    subtotal: z.number().optional(),
    taxTotal: z.number().optional(),
    cgstTotal: z.number().optional(),
    sgstTotal: z.number().optional(),
    igstTotal: z.number().optional(),
    roundOff: z.number().optional(),
    grandTotal: z.number().optional()
  }).optional(),
  notes: z.string().optional()
});

const applyCreditSchema = z.object({
  targetInvoiceId: z.string().min(1, 'Target invoice ID is required'),
  amountToApply: z.number().positive('Amount to apply must be greater than zero').optional()
});

const refundCreditSchema = z.object({
  refundMode: z.enum(['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'Other']),
  refundDate: z.string().optional(),
  referenceNo: z.string().optional(),
  refundedAmount: z.number().positive('Refund amount must be greater than zero').optional(),
  notes: z.string().optional()
});

export const createCreditNote = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createCreditNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const creditNote = await createCreditNoteService(req.tenantId!, req.user!._id, parsed.data);
  return sendSuccess(res, 201, 'Credit Note issued successfully', creditNote);
});

export const getCreditNoteList = asyncHandler(async (req: Request, res: Response) => {
  const { clientId, invoiceId, status, search, from, to, page, limit } = req.query;

  const result = await getCreditNoteListService(req.tenantId!, {
    clientId: clientId as string,
    invoiceId: invoiceId as string,
    status: status as string,
    search: search as string,
    from: from as string,
    to: to as string,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined
  });

  return sendSuccess(res, 200, 'Credit Notes retrieved successfully', result);
});

export const getCreditNoteById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const creditNote = await getCreditNoteByIdService(req.tenantId!, id);
  return sendSuccess(res, 200, 'Credit Note retrieved successfully', creditNote);
});

export const applyUnallocatedCredit = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const parsed = applyCreditSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const result = await applyUnallocatedCreditService(req.tenantId!, req.user!._id, id, parsed.data);
  return sendSuccess(res, 200, 'Credit applied to invoice successfully', result);
});

export const refundCreditNote = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const parsed = refundCreditSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const result = await refundCreditNoteService(req.tenantId!, req.user!._id, id, parsed.data);
  return sendSuccess(res, 200, 'Credit refund recorded successfully', result);
});
