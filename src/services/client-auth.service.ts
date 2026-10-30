import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { ApiError } from '../common/errors/api-error';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'default_access_secret_key';
const CLIENT_TOKEN_EXPIRES_IN = process.env.CLIENT_JWT_EXPIRES_IN || '24h';

export interface ClientTokenPayload {
  clientUserId: string;
  clientId: string;
  tenantId: string;
  role: 'Client';
  isClient: true;
  tokenVersion: number;
}

/**
 * Generate a scoped 24h JWT token specifically for Client Portal access
 */
export const generateClientToken = (payload: ClientTokenPayload): { accessToken: string; expiresIn: string } => {
  const accessToken = jwt.sign(
    {
      ...payload,
      role: 'Client',
      isClient: true
    },
    JWT_SECRET,
    {
      expiresIn: CLIENT_TOKEN_EXPIRES_IN as any
    }
  );

  return {
    accessToken,
    expiresIn: CLIENT_TOKEN_EXPIRES_IN
  };
};

/**
 * Verify and decode client portal access token
 */
export const verifyClientToken = (token: string): ClientTokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.role !== 'Client' || !decoded.isClient) {
      throw new ApiError(403, 'Invalid token: Not a client portal credential', 'INVALID_CLIENT_TOKEN');
    }
    return decoded as ClientTokenPayload;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Client portal session has expired. Please sign in again.', 'TOKEN_EXPIRED');
    }
    throw new ApiError(401, 'Invalid or corrupted client portal access token', 'INVALID_TOKEN');
  }
};

/**
 * Generate a secure 6-digit numeric OTP valid for 10 minutes
 */
export const generateOtp = (): { code: string; expiresAt: Date } => {
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return { code, expiresAt };
};

/**
 * Generate a cryptographically secure 32-byte hex token for magic link authentication (15 minutes)
 */
export const generateMagicLinkToken = (): { token: string; expiresAt: Date } => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  return { token, expiresAt };
};
