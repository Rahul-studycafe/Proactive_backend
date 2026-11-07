import mongoose from 'mongoose';
import * as xlsx from 'xlsx';
import { ApiError } from '../common/errors/api-error';
import {
  ClientPassword,
  IClientPassword,
} from '../models/ClientPassword';
import {
  PortalMaster,
  IPortalMaster,
  DEFAULT_PORTAL_MASTERS,
} from '../models/PortalMaster';
import { PasswordAuditLog, IPasswordAuditLog } from '../models/PasswordAuditLog';
import { Client } from '../modules/clients/schemas/client.schema';
import { encryptPassword, decryptPassword } from '../utils/crypto-vault';

export interface CreatePasswordPayload {
  clientId: string;
  portalId?: string;
  portalName: string;
  portalUrl?: string;
  username: string;
  password: string;
  notes?: string;
  lastVerifiedDate?: string | Date;
}

export interface UpdatePasswordPayload {
  portalId?: string;
  portalName?: string;
  portalUrl?: string;
  username?: string;
  password?: string;
  notes?: string;
  lastVerifiedDate?: string | Date;
}

export interface PasswordQueryParams {
  clientId?: string;
  portalName?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogQueryParams {
  clientId?: string;
  passwordId?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

/**
 * Ensures system default statutory portals exist
 */
export async function seedDefaultPortals(tenantId?: mongoose.Types.ObjectId): Promise<void> {
  const count = await PortalMaster.countDocuments({ isSystemDefault: true });
  if (count === 0) {
    await PortalMaster.insertMany(DEFAULT_PORTAL_MASTERS);
  }
}

/**
 * Returns available portal masters (both system defaults and tenant custom additions)
 */
export async function getPortalMastersService(
  tenantId: mongoose.Types.ObjectId
): Promise<IPortalMaster[]> {
  await seedDefaultPortals(tenantId);

  return PortalMaster.find({
    $or: [{ isSystemDefault: true }, { tenantId }],
    isActive: true,
  }).sort({ category: 1, name: 1 });
}

/**
 * Creates a new encrypted client password record
 */
export async function createClientPasswordService(
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  data: CreatePasswordPayload
): Promise<any> {
  if (!data.clientId || !data.portalName || !data.username || !data.password) {
    throw new ApiError(
      400,
      'Client ID, Portal Name, Username, and Password are all required',
      'VALIDATION_FAILED'
    );
  }

  // Verify client belongs to this tenant
  const clientExists = await Client.findOne({ _id: data.clientId, tenantId });
  if (!clientExists) {
    throw new ApiError(404, 'Client not found in this organization', 'CLIENT_NOT_FOUND');
  }

  // Encrypt the password using AES-256-CBC with randomized IV
  const { encryptedPassword, iv } = encryptPassword(data.password.trim());

  const newCredential = await ClientPassword.create({
    tenantId,
    clientId: data.clientId,
    portalId: data.portalId || undefined,
    portalName: data.portalName.trim(),
    portalUrl: data.portalUrl?.trim() || undefined,
    username: data.username.trim(),
    encryptedPassword,
    iv,
    notes: data.notes?.trim() || undefined,
    lastVerifiedDate: data.lastVerifiedDate ? new Date(data.lastVerifiedDate) : undefined,
    createdBy: userId,
  });

  return {
    _id: newCredential._id,
    clientId: newCredential.clientId,
    portalId: newCredential.portalId,
    portalName: newCredential.portalName,
    portalUrl: newCredential.portalUrl,
    username: newCredential.username,
    notes: newCredential.notes,
    lastVerifiedDate: newCredential.lastVerifiedDate,
    createdAt: newCredential.createdAt,
    updatedAt: newCredential.updatedAt,
    isConfigured: true,
    maskedPassword: '••••••••',
  };
}

/**
 * Lists client passwords with pagination, filtering, and masked secrets
 */
export async function getClientPasswordsService(
  tenantId: mongoose.Types.ObjectId,
  params: PasswordQueryParams
): Promise<{ passwords: any[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const skip = (page - 1) * limit;

  const query: any = { tenantId };

  if (params.clientId) {
    query.clientId = params.clientId;
  }

  if (params.portalName) {
    query.portalName = new RegExp(params.portalName.trim(), 'i');
  }

  if (params.search) {
    const s = params.search.trim();
    query.$or = [
      { portalName: { $regex: s, $options: 'i' } },
      { username: { $regex: s, $options: 'i' } },
      { notes: { $regex: s, $options: 'i' } },
    ];
  }

  const [rawPasswords, total] = await Promise.all([
    ClientPassword.find(query)
      .populate('clientId', 'name clientNumber fileNo pan gstin')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ClientPassword.countDocuments(query),
  ]);

  // Ensure ciphertext and IV are never present in output
  const passwords = rawPasswords.map((item: any) => ({
    _id: item._id,
    clientId: item.clientId,
    portalId: item.portalId,
    portalName: item.portalName,
    portalUrl: item.portalUrl,
    username: item.username,
    notes: item.notes,
    lastVerifiedDate: item.lastVerifiedDate,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    isConfigured: true,
    maskedPassword: '••••••••',
  }));

  return {
    passwords,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Fetches a single password metadata record (masked)
 */
export async function getClientPasswordByIdService(
  tenantId: mongoose.Types.ObjectId,
  id: string
): Promise<any> {
  const item = await ClientPassword.findOne({ _id: id, tenantId })
    .populate('clientId', 'name clientNumber fileNo pan gstin')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name')
    .lean();

  if (!item) {
    throw new ApiError(404, 'Client password credential not found', 'PASSWORD_NOT_FOUND');
  }

  return {
    ...item,
    isConfigured: true,
    maskedPassword: '••••••••',
  };
}

/**
 * Updates client credentials, re-encrypting if password string is supplied
 */
export async function updateClientPasswordService(
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  id: string,
  data: UpdatePasswordPayload
): Promise<any> {
  const credential = await ClientPassword.findOne({ _id: id, tenantId });
  if (!credential) {
    throw new ApiError(404, 'Client password credential not found', 'PASSWORD_NOT_FOUND');
  }

  if (data.portalName !== undefined) credential.portalName = data.portalName.trim();
  if (data.portalUrl !== undefined) credential.portalUrl = data.portalUrl.trim();
  if (data.portalId !== undefined) credential.portalId = data.portalId ? new mongoose.Types.ObjectId(data.portalId) : undefined;
  if (data.username !== undefined) credential.username = data.username.trim();
  if (data.notes !== undefined) credential.notes = data.notes.trim();
  if (data.lastVerifiedDate !== undefined) {
    credential.lastVerifiedDate = data.lastVerifiedDate ? new Date(data.lastVerifiedDate) : undefined;
  }

  // If a new password string is provided, re-encrypt with a fresh randomized IV
  if (data.password && data.password.trim().length > 0) {
    const { encryptedPassword, iv } = encryptPassword(data.password.trim());
    credential.encryptedPassword = encryptedPassword;
    credential.iv = iv;
  }

  credential.updatedBy = userId;
  await credential.save();

  return {
    _id: credential._id,
    clientId: credential.clientId,
    portalId: credential.portalId,
    portalName: credential.portalName,
    portalUrl: credential.portalUrl,
    username: credential.username,
    notes: credential.notes,
    lastVerifiedDate: credential.lastVerifiedDate,
    updatedAt: credential.updatedAt,
    isConfigured: true,
    maskedPassword: '••••••••',
  };
}

/**
 * Deletes client credentials
 */
export async function deleteClientPasswordService(
  tenantId: mongoose.Types.ObjectId,
  id: string
): Promise<void> {
  const res = await ClientPassword.findOneAndDelete({ _id: id, tenantId });
  if (!res) {
    throw new ApiError(404, 'Client password credential not found', 'PASSWORD_NOT_FOUND');
  }
}

/**
 * Decrypts and reveals password on demand while logging statutory access audit
 */
export async function revealClientPasswordService(
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  id: string,
  ipAddress?: string,
  userAgent?: string,
  purpose?: string
): Promise<{ password: string; portalName: string; username: string; portalUrl?: string }> {
  // Query must explicitly select the protected encrypted fields
  const credential = await ClientPassword.findOne({ _id: id, tenantId }).select(
    '+encryptedPassword +iv'
  );

  if (!credential) {
    throw new ApiError(404, 'Client password credential not found', 'PASSWORD_NOT_FOUND');
  }

  // Decrypt password
  const plainTextPassword = decryptPassword(credential.encryptedPassword, credential.iv);

  // Write tamper-evident audit record
  await PasswordAuditLog.create({
    tenantId,
    passwordId: credential._id,
    clientId: credential.clientId,
    portalName: credential.portalName,
    username: credential.username,
    accessedByUserId: userId,
    accessedAt: new Date(),
    ipAddress: ipAddress || 'Unknown',
    userAgent: userAgent || 'Unknown',
    purpose: purpose?.trim() || 'Portal Login / Client Operations',
  });

  return {
    password: plainTextPassword,
    portalName: credential.portalName,
    username: credential.username,
    portalUrl: credential.portalUrl,
  };
}

/**
 * Retrieves audit log of staff access to client credentials
 */
export async function getPasswordAuditLogsService(
  tenantId: mongoose.Types.ObjectId,
  params: AuditLogQueryParams
): Promise<{ logs: IPasswordAuditLog[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const skip = (page - 1) * limit;

  const query: any = { tenantId };

  if (params.clientId) query.clientId = params.clientId;
  if (params.passwordId) query.passwordId = params.passwordId;
  if (params.userId) query.accessedByUserId = params.userId;

  const [logs, total] = await Promise.all([
    PasswordAuditLog.find(query)
      .populate('clientId', 'name clientNumber fileNo')
      .populate('accessedByUserId', 'name email role')
      .sort({ accessedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PasswordAuditLog.countDocuments(query),
  ]);

  return {
    logs: logs as IPasswordAuditLog[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Bulk imports credentials from an Excel buffer
 */
export async function bulkImportPasswordsService(
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  fileBuffer: Buffer
): Promise<{ totalRows: number; importedCount: number; updatedCount: number; skippedErrors: string[] }> {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new ApiError(400, 'Empty or invalid Excel file provided', 'INVALID_FILE');
  }

  let workbook: xlsx.WorkBook;
  try {
    workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  } catch (err: any) {
    throw new ApiError(400, 'Failed to parse Excel spreadsheet. Ensure it is a valid .xlsx or .xls file.', 'PARSE_ERROR');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new ApiError(400, 'Excel workbook contains no sheets', 'EMPTY_WORKBOOK');
  }

  const rawRows: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rawRows || rawRows.length === 0) {
    return { totalRows: 0, importedCount: 0, updatedCount: 0, skippedErrors: ['No data rows found in worksheet'] };
  }

  // Pre-fetch all clients for fast in-memory lookup by File No or Client Number or Name
  const clients = await Client.find({ tenantId }).select('_id name clientNumber fileNo').lean();
  const clientMapByFileNo = new Map<string, mongoose.Types.ObjectId>();
  const clientMapByName = new Map<string, mongoose.Types.ObjectId>();

  for (const c of clients) {
    if (c.clientNumber) clientMapByFileNo.set(c.clientNumber.toLowerCase().trim(), c._id as mongoose.Types.ObjectId);
    if (c.fileNo) clientMapByFileNo.set(c.fileNo.toLowerCase().trim(), c._id as mongoose.Types.ObjectId);
    if (c.name) clientMapByName.set(c.name.toLowerCase().trim(), c._id as mongoose.Types.ObjectId);
  }

  let importedCount = 0;
  let updatedCount = 0;
  const skippedErrors: string[] = [];

  for (let idx = 0; idx < rawRows.length; idx++) {
    const row = rawRows[idx];
    const rowNum = idx + 2; // Accounting for 1-indexed Excel + header row

    // Normalize keys (case-insensitive & whitespace trimmed)
    const normalized: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      normalized[key.trim().toLowerCase()] = String(row[key]).trim();
    }

    const clientIdentifier =
      normalized['client file no'] ||
      normalized['client file no.'] ||
      normalized['file no'] ||
      normalized['file no.'] ||
      normalized['client name'] ||
      normalized['client'] ||
      '';

    const portalName = normalized['portal name'] || normalized['portal'] || '';
    const username = normalized['username'] || normalized['user id'] || normalized['login id'] || '';
    const password = normalized['password'] || '';
    const portalUrl = normalized['portal url'] || normalized['url'] || '';
    const notes = normalized['notes'] || normalized['remarks'] || '';

    if (!clientIdentifier) {
      skippedErrors.push(`Row ${rowNum}: Missing Client identifier (Name or File No)`);
      continue;
    }

    if (!portalName) {
      skippedErrors.push(`Row ${rowNum}: Missing Portal Name`);
      continue;
    }

    if (!username) {
      skippedErrors.push(`Row ${rowNum}: Missing Username`);
      continue;
    }

    if (!password) {
      skippedErrors.push(`Row ${rowNum}: Missing Password`);
      continue;
    }

    // Resolve client
    const lowerIdent = clientIdentifier.toLowerCase();
    const resolvedClientId = clientMapByFileNo.get(lowerIdent) || clientMapByName.get(lowerIdent);

    if (!resolvedClientId) {
      skippedErrors.push(`Row ${rowNum}: Client "${clientIdentifier}" not found in this organization`);
      continue;
    }

    // Encrypt password
    const { encryptedPassword, iv } = encryptPassword(password);

    // Upsert credential for this (tenantId, clientId, portalName)
    const existing = await ClientPassword.findOne({
      tenantId,
      clientId: resolvedClientId,
      portalName,
    });

    if (existing) {
      existing.username = username;
      existing.encryptedPassword = encryptedPassword;
      existing.iv = iv;
      if (portalUrl) existing.portalUrl = portalUrl;
      if (notes) existing.notes = notes;
      existing.updatedBy = userId;
      await existing.save();
      updatedCount++;
    } else {
      await ClientPassword.create({
        tenantId,
        clientId: resolvedClientId,
        portalName,
        portalUrl: portalUrl || undefined,
        username,
        encryptedPassword,
        iv,
        notes: notes || undefined,
        createdBy: userId,
      });
      importedCount++;
    }
  }

  return {
    totalRows: rawRows.length,
    importedCount,
    updatedCount,
    skippedErrors,
  };
}
