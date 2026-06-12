import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { verifyAccessToken } from '../services/auth.service';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { runWithTenant } from '../utils/tenantContext';

/**
 * Authentication middleware.
 * 
 * 1. Reads the `Authorization: Bearer <token>` header
 * 2. Verifies the access token via auth.service
 * 3. Looks up the user in the DB and validates tokenVersion
 * 4. Attaches req.user and req.tenantId
 * 5. Wraps the remaining request lifecycle inside AsyncLocalStorage
 *    so the tenantPlugin can auto-inject tenantId into every query
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Access token is required', 'AUTH_REQUIRED');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    // Look up the user — using skipTenantPlugin because we don't have
    // the tenant context set yet at this point
    const user = await User.findById(payload.userId)
      .select('+password')
      .setOptions({ skipTenantPlugin: true });

    if (!user) {
      throw new ApiError(401, 'User not found', 'USER_NOT_FOUND');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'Account has been deactivated', 'ACCOUNT_DEACTIVATED');
    }

    // Verify tokenVersion — if the user has logged out everywhere,
    // the tokenVersion in the DB will be incremented, invalidating old tokens
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new ApiError(401, 'Token has been invalidated. Please login again.', 'TOKEN_REVOKED');
    }

    const tenantId = new mongoose.Types.ObjectId(payload.tenantId);

    // Attach to request
    req.user = {
      _id: user._id as mongoose.Types.ObjectId,
      tenantId,
      name: user.name,
      username: user.username,
      roleId: user.roleId,
      tokenVersion: user.tokenVersion
    };
    req.tenantId = tenantId;

    // Run the rest of the request inside the tenant context
    // so every downstream Mongoose query is automatically scoped
    runWithTenant(tenantId, () => {
      next();
    });

  } catch (error) {
    next(error);
  }
};
