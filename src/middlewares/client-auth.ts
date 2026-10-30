import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { verifyClientToken } from '../services/client-auth.service';
import { ClientUser } from '../models/ClientUser';
import { Client } from '../modules/clients/schemas/client.schema';
import { ApiError } from '../common/errors/api-error';
import { runWithTenant } from '../utils/tenant-context';

/**
 * Client Portal Authentication Middleware
 * 
 * 1. Reads the `Authorization: Bearer <token>` header
 * 2. Verifies the scoped client token
 * 3. Validates client user and parent client organization are active and allowLogin is enabled
 * 4. Checks tokenVersion for global session invalidation
 * 5. Injects req.clientUser, req.clientId, req.tenantId, and req.isClient
 * 6. Wraps downstream execution inside runWithTenant for multi-tenant isolation
 */
export const clientAuthenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Client portal access token is required', 'AUTH_REQUIRED');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyClientToken(token);

    if (!payload.isClient || payload.role !== 'Client') {
      throw new ApiError(403, 'Invalid token: Not authorized for client portal', 'FORBIDDEN_ACCESS');
    }

    // Lookup ClientUser
    const user = await ClientUser.findById(payload.clientUserId).setOptions({ skipTenantPlugin: true });

    if (!user) {
      throw new ApiError(401, 'Client user account not found', 'USER_NOT_FOUND');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'Your client portal user account has been deactivated', 'ACCOUNT_DEACTIVATED');
    }

    // Verify token version for session revocation
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new ApiError(401, 'Your portal session has expired. Please sign in again.', 'TOKEN_REVOKED');
    }

    // Lookup parent Client entity
    const client = await Client.findById(payload.clientId).setOptions({ skipTenantPlugin: true });

    if (!client || !client.isActive) {
      throw new ApiError(403, 'Client account is inactive or not found', 'CLIENT_INACTIVE');
    }

    if (!client.allowLogin) {
      throw new ApiError(
        403,
        'Portal access is currently disabled for your organization. Please contact your accountant.',
        'PORTAL_ACCESS_DISABLED'
      );
    }

    const tenantId = new mongoose.Types.ObjectId(payload.tenantId);
    const clientId = new mongoose.Types.ObjectId(payload.clientId);

    req.clientUser = {
      _id: user._id as mongoose.Types.ObjectId,
      clientId,
      tenantId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isPrimaryContact: user.isPrimaryContact,
      tokenVersion: user.tokenVersion,
      role: 'Client'
    };
    req.clientId = clientId;
    req.tenantId = tenantId;
    req.isClient = true;

    // Run downstream inside tenant context
    runWithTenant(tenantId, () => {
      next();
    });
  } catch (error) {
    next(error);
  }
};
