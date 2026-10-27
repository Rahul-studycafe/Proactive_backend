import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  createDscService,
  getDscListService,
  getDscByIdService,
  updateDscService,
  deleteDscService,
  logDscHandoverService,
  getDscHistoryService,
  scanDscExpiriesService,
  getDscSummaryKpiService
} from '../services/dsc.service';

const createDscSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  certificateName: z.string().min(2, 'Certificate name is required'),
  certificateClass: z.enum(['Class 2', 'Class 3']).optional(),
  tokenType: z.enum(['ePass2003', 'ProxKey', 'mToken', 'Watchdata', 'Other']).optional(),
  tokenSerialNumber: z.string().optional(),
  issuingAuthority: z.enum(['eMudhra', 'Capricorn', 'Vsign', 'Sify', 'IDSign', 'Other']).optional(),
  issueDate: z.string().min(1, 'Issue date is required'),
  expiryDate: z.string().min(1, 'Expiry date is required'),
  physicalLocation: z.string().min(1, 'Physical office storage location is required'),
  status: z.enum(['In Office', 'With Client', 'Expired', 'Renewed']).optional(),
  currentHolderName: z.string().optional(),
  notes: z.string().optional()
});

const updateDscSchema = z.object({
  certificateName: z.string().min(2).optional(),
  certificateClass: z.enum(['Class 2', 'Class 3']).optional(),
  tokenType: z.enum(['ePass2003', 'ProxKey', 'mToken', 'Watchdata', 'Other']).optional(),
  tokenSerialNumber: z.string().optional(),
  issuingAuthority: z.enum(['eMudhra', 'Capricorn', 'Vsign', 'Sify', 'IDSign', 'Other']).optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  physicalLocation: z.string().optional(),
  status: z.enum(['In Office', 'With Client', 'Expired', 'Renewed']).optional(),
  currentHolderName: z.string().optional(),
  notes: z.string().optional()
});

const dscHandoverSchema = z.object({
  action: z.enum(['Handed to Client', 'Received from Client', 'Internal Transfer']),
  transferredToName: z.string().min(1, 'Recipient / Transferee name is required'),
  transferredToPhone: z.string().optional(),
  reason: z.string().min(1, 'Movement reason is required'),
  expectedReturnDate: z.string().optional(),
  receivedBackDate: z.string().optional(),
  notes: z.string().optional()
});

export const createDsc = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createDscSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const dsc = await createDscService(req.tenantId!, req.user!._id, parsed.data);
  return sendSuccess(res, 201, 'DSC token registered successfully', dsc);
});

export const getDscList = asyncHandler(async (req: Request, res: Response) => {
  const { clientId, status, search, expiringWithinDays, page, limit } = req.query;

  const result = await getDscListService(req.tenantId!, {
    clientId: clientId as string,
    status: status as string,
    search: search as string,
    expiringWithinDays: expiringWithinDays ? Number(expiringWithinDays) : undefined,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined
  });

  return sendSuccess(res, 200, 'DSC inventory retrieved successfully', result);
});

export const getDscById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await getDscByIdService(req.tenantId!, id);
  return sendSuccess(res, 200, 'DSC details retrieved successfully', result);
});

export const updateDsc = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const parsed = updateDscSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const dsc = await updateDscService(req.tenantId!, id, parsed.data);
  return sendSuccess(res, 200, 'DSC updated successfully', dsc);
});

export const deleteDsc = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deleteDscService(req.tenantId!, id);
  return sendSuccess(res, 200, 'DSC token removed successfully', { id });
});

export const logDscHandover = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const parsed = dscHandoverSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
  }

  const result = await logDscHandoverService(req.tenantId!, req.user!._id, id, parsed.data);
  return sendSuccess(res, 201, 'DSC handover logged successfully', result);
});

export const getDscHistory = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const history = await getDscHistoryService(req.tenantId!, id);
  return sendSuccess(res, 200, 'DSC movement history retrieved', history);
});

export const triggerDscScan = asyncHandler(async (req: Request, res: Response) => {
  const referenceDate = req.body?.referenceDate ? new Date(req.body.referenceDate) : new Date();
  const summary = await scanDscExpiriesService(req.tenantId!, referenceDate);
  return sendSuccess(res, 200, 'DSC expiry scan executed successfully', summary);
});

export const getDscSummaryKpi = asyncHandler(async (req: Request, res: Response) => {
  const kpi = await getDscSummaryKpiService(req.tenantId!);
  return sendSuccess(res, 200, 'DSC summary KPIs retrieved', kpi);
});
