import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { ApiError } from '../../../common/errors/api-error';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'default_access_secret_key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'default_refresh_secret_key';

export interface TokenPayload {
  userId: string;
  tenantId: string;
  roleId: string;
  tokenVersion: number;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '15m'
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: '7d'
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Access token has expired', 'TOKEN_EXPIRED');
    }
    throw new ApiError(401, 'Invalid access token', 'INVALID_TOKEN');
  }
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Refresh token has expired', 'TOKEN_EXPIRED');
    }
    throw new ApiError(401, 'Invalid refresh token', 'INVALID_TOKEN');
  }
};
