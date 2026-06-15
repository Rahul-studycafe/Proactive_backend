import { describe, it, expect } from '@jest/globals';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyAccessToken, 
  verifyRefreshToken,
  TokenPayload
} from '../modules/auth/services/auth.service';
import jwt from 'jsonwebtoken';

describe('Phase 7: Auth Service (JWT Utilities)', () => {
  
  const mockPayload: TokenPayload = {
    userId: 'user-123',
    tenantId: 'tenant-456',
    roleId: 'role-789',
    tokenVersion: 1
  };

  it('should generate and verify an Access Token successfully', () => {
    const token = generateAccessToken(mockPayload);
    expect(typeof token).toBe('string');
    
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(mockPayload.userId);
    expect(decoded.tenantId).toBe(mockPayload.tenantId);
    expect(decoded.roleId).toBe(mockPayload.roleId);
    expect(decoded.tokenVersion).toBe(mockPayload.tokenVersion);
    expect(decoded).toHaveProperty('exp');
    expect(decoded).toHaveProperty('iat');
  });

  it('should generate and verify a Refresh Token successfully', () => {
    const token = generateRefreshToken(mockPayload);
    expect(typeof token).toBe('string');
    
    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe(mockPayload.userId);
    expect(decoded.tenantId).toBe(mockPayload.tenantId);
    expect(decoded.roleId).toBe(mockPayload.roleId);
    expect(decoded.tokenVersion).toBe(mockPayload.tokenVersion);
    expect(decoded).toHaveProperty('exp');
    expect(decoded).toHaveProperty('iat');
  });

  it('should throw ApiError for an invalid Access Token', () => {
    expect(() => {
      verifyAccessToken('invalid.token.string');
    }).toThrow('Invalid access token');
  });

  it('should throw ApiError for an invalid Refresh Token', () => {
    expect(() => {
      verifyRefreshToken('invalid.token.string');
    }).toThrow('Invalid refresh token');
  });

});
