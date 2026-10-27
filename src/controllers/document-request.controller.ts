import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  createDocumentRequestService,
  getDocumentRequestListService,
  getDocumentRequestByIdService,
  resendDocumentRequestService,
  cancelDocumentRequestService,
  scanExpiredDocumentRequestsService,
  getPublicDocumentRequestByTokenService,
  uploadPublicFileService
} from '../services/document-request.service';

const createDocumentRequestSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  taskId: z.string().optional(),
  title: z.string().min(2, 'Request title must be at least 2 characters'),
  instructions: z.string().optional(),
  expiresInDays: z.number().int().positive().optional(),
  items: z
    .array(
      z.object({
        name: z.string().min(1, 'Document name is required'),
        description: z.string().optional(),
        isRequired: z.boolean().optional(),
        acceptedFormats: z.array(z.string()).optional()
      })
    )
    .min(1, 'At least one document must be requested')
});

/**
 * Creates document request checklist & generates magic link
 */
export const createDocumentRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = createDocumentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errors);
    }

    const result = await createDocumentRequestService(
      req.tenantId!,
      parsed.data,
      req.user!._id
    );

    return sendSuccess(
      res,
      201,
      'Document request created and link generated successfully',
      result
    );
  }
);

/**
 * Staff oversight: paginated list of client document requests
 */
export const getDocumentRequestList = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await getDocumentRequestListService(
      req.tenantId!,
      req.query as any
    );
    return sendSuccess(
      res,
      200,
      'Document requests retrieved successfully',
      result
    );
  }
);

/**
 * Staff: retrieves single document request details
 */
export const getDocumentRequestById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await getDocumentRequestByIdService(req.tenantId!, id);
    return sendSuccess(
      res,
      200,
      'Document request details retrieved successfully',
      result
    );
  }
);

/**
 * Staff: resends invitation email to client
 */
export const resendDocumentRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await resendDocumentRequestService(req.tenantId!, id);
    return sendSuccess(
      res,
      200,
      'Document request reminder dispatched successfully',
      result
    );
  }
);

/**
 * Staff: cancels document request and revokes token
 */
export const cancelDocumentRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await cancelDocumentRequestService(req.tenantId!, id);
    return sendSuccess(
      res,
      200,
      'Document request cancelled successfully',
      result
    );
  }
);

/**
 * Staff / Cron: triggers scan of expired requests
 */
export const triggerExpiredScan = asyncHandler(
  async (req: Request, res: Response) => {
    const { referenceDate } = req.body;
    const summary = await scanExpiredDocumentRequestsService(
      req.tenantId!,
      referenceDate ? new Date(referenceDate) : new Date()
    );
    return sendSuccess(
      res,
      200,
      'Document requests expiration scan completed',
      summary
    );
  }
);

/**
 * Public portal: client resolves metadata without authentication
 */
export const getPublicDocumentRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const token = req.params.token as string;
    const result = await getPublicDocumentRequestByTokenService(token);
    return sendSuccess(
      res,
      200,
      'Public document request metadata retrieved successfully',
      result
    );
  }
);

/**
 * Public portal: client uploads file for a checklist item
 */
export const uploadPublicFile = asyncHandler(
  async (req: Request, res: Response) => {
    const token = req.params.token as string;
    const itemId = (req.body.itemId || req.query.itemId) as string;

    if (!itemId) {
      throw new ApiError(
        400,
        'Item ID is required to associate uploaded document',
        'ITEM_ID_MISSING'
      );
    }

    if (!req.file) {
      throw new ApiError(400, 'Please select a file to upload', 'FILE_MISSING');
    }

    const result = await uploadPublicFileService(token, itemId, req.file);
    return sendSuccess(
      res,
      200,
      'File uploaded and linked successfully',
      result
    );
  }
);
