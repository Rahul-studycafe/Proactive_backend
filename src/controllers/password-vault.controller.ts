import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import {
  createClientPasswordService,
  getClientPasswordsService,
  getClientPasswordByIdService,
  updateClientPasswordService,
  deleteClientPasswordService,
  revealClientPasswordService,
  getPasswordAuditLogsService,
  bulkImportPasswordsService,
  getPortalMastersService,
} from '../services/password-vault.service';

const createPasswordSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  portalId: z.string().optional(),
  portalName: z.string().min(1, 'Portal name is required'),
  portalUrl: z.string().optional(),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  notes: z.string().optional(),
  lastVerifiedDate: z.string().optional(),
});

const updatePasswordSchema = z.object({
  portalId: z.string().optional(),
  portalName: z.string().optional(),
  portalUrl: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  notes: z.string().optional(),
  lastVerifiedDate: z.string().optional(),
});

const revealPasswordSchema = z.object({
  purpose: z.string().optional(),
});

/**
 * Returns available statutory and custom portals list
 */
export const getPortals = asyncHandler(async (req: Request, res: Response) => {
  const portals = await getPortalMastersService(req.tenantId!);
  return sendSuccess(res, 200, 'Portals catalog retrieved successfully', portals);
});

/**
 * Creates an encrypted client credential
 */
export const createPassword = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errorDetails);
  }

  const credential = await createClientPasswordService(
    req.tenantId!,
    req.user!._id,
    parsed.data
  );

  return sendSuccess(res, 201, 'Client password saved and encrypted successfully', credential);
});

/**
 * Lists masked client credentials with filtering and pagination
 */
export const getPasswords = asyncHandler(async (req: Request, res: Response) => {
  const { clientId, portalName, search, page, limit } = req.query;

  const result = await getClientPasswordsService(req.tenantId!, {
    clientId: clientId as string,
    portalName: portalName as string,
    search: search as string,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  return sendSuccess(res, 200, 'Client credentials retrieved successfully', result);
});

/**
 * Fetches single masked credential metadata
 */
export const getPasswordById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const credential = await getClientPasswordByIdService(req.tenantId!, id);
  return sendSuccess(res, 200, 'Credential details retrieved successfully', credential);
});

/**
 * Updates client credential metadata and optionally re-encrypts password
 */
export const updatePassword = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const parsed = updatePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ApiError(400, 'Validation Error', 'VALIDATION_FAILED', errorDetails);
  }

  const updated = await updateClientPasswordService(
    req.tenantId!,
    req.user!._id,
    id,
    parsed.data
  );

  return sendSuccess(res, 200, 'Client credential updated successfully', updated);
});

/**
 * Deletes client credential
 */
export const deletePassword = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deleteClientPasswordService(req.tenantId!, id);
  return sendSuccess(res, 200, 'Client credential deleted successfully');
});

/**
 * Decrypts and reveals plain password with statutory audit logging
 */
export const revealPassword = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const parsed = revealPasswordSchema.safeParse(req.body);
  const purpose = parsed.success ? parsed.data.purpose : undefined;

  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    'Unknown';
  const userAgent = req.headers['user-agent'] || 'Unknown';

  const revealed = await revealClientPasswordService(
    req.tenantId!,
    req.user!._id,
    id,
    clientIp,
    userAgent,
    purpose
  );

  return sendSuccess(res, 200, 'Password revealed and logged successfully', revealed);
});

/**
 * Retrieves statutory access audit logs
 */
export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { clientId, passwordId, userId, page, limit } = req.query;

  const result = await getPasswordAuditLogsService(req.tenantId!, {
    clientId: clientId as string,
    passwordId: passwordId as string,
    userId: userId as string,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  return sendSuccess(res, 200, 'Access audit logs retrieved successfully', result);
});

/**
 * Bulk imports credentials from an Excel file
 */
export const bulkImport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file || !req.file.buffer) {
    throw new ApiError(400, 'Please select an Excel (.xlsx/.xls) file to upload', 'FILE_MISSING');
  }

  const result = await bulkImportPasswordsService(
    req.tenantId!,
    req.user!._id,
    req.file.buffer
  );

  return sendSuccess(res, 200, 'Passwords bulk import completed', result);
});
