import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  createPhysicalDocumentService,
  getPhysicalDocumentListService,
  getPhysicalDocumentByIdService,
  updatePhysicalDocumentService,
  deletePhysicalDocumentService,
  returnPhysicalDocumentService,
  getStorageLocationsService,
  createStorageLocationService,
  updateStorageLocationService,
  deleteStorageLocationService,
  scanOverduePhysicalDocumentsService,
  exportPhysicalDocumentsCsvService,
  generateHandoverSlipService,
  getAvailablePhysicalDocsForMovementService,
  getDocumentMovementHistoryService
} from '../services/physical-document.service';

const createPhysicalDocumentSchema = z.object({
  documentId: z.string().optional(),
  clientId: z.string().min(1, 'Client ID is required'),
  date: z.string().optional(),
  category: z.enum(['Received', 'Given']),
  documentType: z.enum([
    'Passbook',
    'Cheque Book',
    'Original Deeds',
    'PAN Card',
    'Registration Certificate',
    'Company Seal',
    'Other'
  ]),
  documentName: z.string().min(2, 'Document name must be at least 2 characters'),
  isReturnable: z.boolean().optional(),
  returnDate: z.string().optional(),
  location: z.string().min(2, 'Office storage location is required'),
  custodianUserId: z.string().optional(),
  receivedByPersonName: z.string().optional(),
  receivedByPhone: z.string().optional(),
  notes: z.string().optional()
});

const updatePhysicalDocumentSchema = z.object({
  clientId: z.string().optional(),
  date: z.string().optional(),
  category: z.enum(['Received', 'Given']).optional(),
  documentType: z
    .enum([
      'Passbook',
      'Cheque Book',
      'Original Deeds',
      'PAN Card',
      'Registration Certificate',
      'Company Seal',
      'Other'
    ])
    .optional(),
  documentName: z.string().min(2).optional(),
  isReturnable: z.boolean().optional(),
  returnDate: z.string().nullable().optional(),
  location: z.string().min(2).optional(),
  custodianUserId: z.string().optional(),
  receivedByPersonName: z.string().optional(),
  receivedByPhone: z.string().optional(),
  notes: z.string().optional()
});

const returnPhysicalDocumentSchema = z.object({
  actualReturnedDate: z.string().optional(),
  returnedToPersonName: z.string().optional(),
  returnedNotes: z.string().optional()
});

const createStorageLocationSchema = z.object({
  name: z.string().min(2, 'Storage unit name must be at least 2 characters'),
  code: z.string().optional(),
  unitType: z
    .enum(['Cabinet', 'Shelf', 'Safe Box', 'Locker', 'Drawer', 'Archive Room', 'Other'])
    .optional(),
  roomOrFloor: z.string().optional(),
  description: z.string().optional()
});

const updateStorageLocationSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().optional(),
  unitType: z
    .enum(['Cabinet', 'Shelf', 'Safe Box', 'Locker', 'Drawer', 'Archive Room', 'Other'])
    .optional(),
  roomOrFloor: z.string().optional(),
  description: z.string().optional(),
  updateReferencedDocs: z.boolean().optional()
});

export const createPhysicalDocument = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = createPhysicalDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
    }

    const doc = await createPhysicalDocumentService(
      req.tenantId!,
      parsed.data,
      req.user!._id
    );

    return sendSuccess(
      res,
      201,
      'Physical document logged successfully in custody register',
      doc
    );
  }
);

export const getPhysicalDocumentList = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await getPhysicalDocumentListService(
      req.tenantId!,
      req.query as any
    );
    return sendSuccess(
      res,
      200,
      'Physical documents retrieved successfully',
      result
    );
  }
);

export const getPhysicalDocumentById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const doc = await getPhysicalDocumentByIdService(req.tenantId!, id);
    return sendSuccess(
      res,
      200,
      'Physical document details retrieved successfully',
      doc
    );
  }
);

export const updatePhysicalDocument = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const parsed = updatePhysicalDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
    }

    const doc = await updatePhysicalDocumentService(
      req.tenantId!,
      id,
      parsed.data
    );
    return sendSuccess(
      res,
      200,
      'Physical document record updated successfully',
      doc
    );
  }
);

export const deletePhysicalDocument = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await deletePhysicalDocumentService(req.tenantId!, id);
    return sendSuccess(
      res,
      200,
      'Physical document record deleted successfully',
      null
    );
  }
);

export const returnPhysicalDocument = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const parsed = returnPhysicalDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
    }

    const doc = await returnPhysicalDocumentService(
      req.tenantId!,
      id,
      parsed.data
    );
    return sendSuccess(
      res,
      200,
      'Document return acknowledged and recorded successfully',
      doc
    );
  }
);

export const getStorageLocations = asyncHandler(
  async (req: Request, res: Response) => {
    const locations = await getStorageLocationsService(req.tenantId!);
    return sendSuccess(
      res,
      200,
      'Physical storage locations retrieved successfully',
      locations
    );
  }
);

export const createStorageLocation = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = createStorageLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
    }

    const unit = await createStorageLocationService(req.tenantId!, parsed.data);
    return sendSuccess(
      res,
      201,
      'Office storage unit created successfully',
      unit
    );
  }
);

export const updateStorageLocation = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = updateStorageLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
    }

    const id = req.params.id as string;
    const unit = await updateStorageLocationService(
      req.tenantId!,
      id,
      parsed.data
    );

    return sendSuccess(
      res,
      200,
      'Office storage unit updated successfully',
      unit
    );
  }
);

export const deleteStorageLocation = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await deleteStorageLocationService(req.tenantId!, id);
    return sendSuccess(
      res,
      200,
      'Office storage unit deleted successfully'
    );
  }
);

export const triggerOverdueScan = asyncHandler(
  async (req: Request, res: Response) => {
    const { referenceDate } = req.body;
    const summary = await scanOverduePhysicalDocumentsService(
      req.tenantId!,
      referenceDate ? new Date(referenceDate) : new Date()
    );
    return sendSuccess(
      res,
      200,
      'Physical documents overdue scan completed',
      summary
    );
  }
);

export const exportPhysicalDocumentsCsv = asyncHandler(
  async (req: Request, res: Response) => {
    const csvData = await exportPhysicalDocumentsCsvService(
      req.tenantId!,
      req.query as any
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="docs-in-out-register.csv"'
    );
    return res.status(200).send(csvData);
  }
);

export const getHandoverSlip = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const slip = await generateHandoverSlipService(req.tenantId!, id);

    if (req.query.format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(slip.html);
    }

    return sendSuccess(
      res,
      200,
      'Handover slip generated successfully',
      slip
    );
  }
);

export const getAvailablePhysicalDocsForMovement = asyncHandler(
  async (req: Request, res: Response) => {
    const clientId = req.query.clientId as string;
    const category = (req.query.category as any) || 'Given';

    if (!clientId) {
      throw new ApiError(400, 'Client ID is required', 'VALIDATION_ERROR');
    }

    const docs = await getAvailablePhysicalDocsForMovementService(
      req.tenantId!,
      clientId,
      category
    );

    return sendSuccess(
      res,
      200,
      'Available documents for movement fetched successfully',
      docs
    );
  }
);

export const getDocumentMovementHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await getDocumentMovementHistoryService(
      req.tenantId!,
      id
    );

    return sendSuccess(
      res,
      200,
      'Document movement history retrieved successfully',
      result
    );
  }
);
