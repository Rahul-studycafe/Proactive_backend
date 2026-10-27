import { Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../utils/ApiResponse';
import { QuotationService } from '../services/quotation.service';

const quotationItemSchema = z.object({
  serviceId: z.string().optional(),
  description: z.string().min(1, 'Item description is required'),
  sacCode: z.string().optional(),
  rate: z.coerce.number().min(0, 'Rate cannot be negative'),
  quantity: z.coerce.number().min(0.01, 'Quantity must be at least 0.01').default(1),
  discount: z.coerce.number().min(0).default(0),
  gstPercentage: z.coerce.number().min(0).default(18)
});

const createQuotationSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  billingEntityId: z.string().optional(),
  date: z.string().optional(),
  validUntil: z.string().optional(),
  isInterState: z.boolean().optional(),
  items: z.array(quotationItemSchema).min(1, 'At least one line item is required'),
  termsAndConditions: z.string().optional(),
  notes: z.string().optional()
});

const updateQuotationSchema = z.object({
  billingEntityId: z.string().nullable().optional(),
  date: z.string().optional(),
  validUntil: z.string().optional(),
  isInterState: z.boolean().optional(),
  items: z.array(quotationItemSchema).min(1).optional(),
  termsAndConditions: z.string().optional(),
  notes: z.string().optional()
});

const updateStatusSchema = z.object({
  status: z.enum(['Draft', 'Sent', 'Accepted', 'Declined'])
});

const sendEmailSchema = z.object({
  email: z.string().email('Invalid recipient email address').optional()
});

const convertToInvoiceSchema = z.object({
  status: z.enum(['Draft', 'Unpaid']).default('Unpaid')
});

export const createQuotation = asyncHandler(async (req: Request, res: Response) => {
  const data = createQuotationSchema.parse(req.body);

  const quotation = await QuotationService.createQuotation(
    req.tenantId as mongoose.Types.ObjectId,
    req.user!._id as mongoose.Types.ObjectId,
    data
  );

  sendSuccess(res, 201, 'Quotation created successfully', quotation);
});

export const getQuotations = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    clientId: req.query.clientId as string | undefined,
    status: req.query.status as any,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    search: req.query.search as string | undefined,
    page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10
  };

  const result = await QuotationService.getQuotations(
    req.tenantId as mongoose.Types.ObjectId,
    query
  );

  sendSuccess(res, 200, 'Quotations retrieved successfully', result);
});

export const getQuotationById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const quotation = await QuotationService.getQuotationById(
    req.tenantId as mongoose.Types.ObjectId,
    id
  );

  sendSuccess(res, 200, 'Quotation retrieved successfully', quotation);
});

export const updateQuotation = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = updateQuotationSchema.parse(req.body);

  const quotation = await QuotationService.updateQuotation(
    req.tenantId as mongoose.Types.ObjectId,
    id,
    data as any
  );

  sendSuccess(res, 200, 'Quotation updated successfully', quotation);
});

export const deleteQuotation = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await QuotationService.deleteQuotation(req.tenantId as mongoose.Types.ObjectId, id);
  sendSuccess(res, 200, 'Quotation deleted successfully', { deleted: true });
});

export const updateQuotationStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status } = updateStatusSchema.parse(req.body);

  const quotation = await QuotationService.updateQuotationStatus(
    req.tenantId as mongoose.Types.ObjectId,
    id,
    status
  );

  sendSuccess(res, 200, 'Quotation status updated successfully', quotation);
});

export const sendQuotationEmail = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const body = sendEmailSchema.parse(req.body);

  const result = await QuotationService.sendQuotationEmail(
    req.tenantId as mongoose.Types.ObjectId,
    id,
    body.email
  );

  sendSuccess(res, 200, 'Quotation email dispatched successfully', result);
});

export const convertToInvoice = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const options = convertToInvoiceSchema.parse(req.body || {});

  const result = await QuotationService.convertToInvoice(
    req.tenantId as mongoose.Types.ObjectId,
    id,
    options
  );

  sendSuccess(res, 201, 'Quotation converted to invoice successfully', result);
});

export const getPrintLayout = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await QuotationService.getPrintLayout(
    req.tenantId as mongoose.Types.ObjectId,
    id
  );

  sendSuccess(res, 200, 'Print layout metadata retrieved successfully', result);
});

export const getQuotationPipelineAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined
  };

  const analytics = await QuotationService.getQuotationPipelineAnalytics(
    req.tenantId as mongoose.Types.ObjectId,
    query
  );

  sendSuccess(res, 200, 'Quotation pipeline analytics retrieved successfully', analytics);
});
