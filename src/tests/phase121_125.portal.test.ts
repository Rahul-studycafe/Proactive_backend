import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import connectDB from '../config/db';
import {
  generateClientToken,
  verifyClientToken,
  generateOtp,
  generateMagicLinkToken,
} from '../services/client-auth.service';

describe('Part 25 (Phases 121–125): Client Portal Authentication & Security Layer', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });
  describe('Client Auth Crypto Service', () => {
    it('should generate and verify a valid client token with role Client', () => {
      const payload = {
        clientUserId: '6adc83e477289e476175c501',
        clientId: '6adc83e477289e476175c5f0',
        tenantId: '6adc83e477289e476175c5aa',
        role: 'Client' as const,
        isClient: true as const,
        tokenVersion: 0,
      };

      const { accessToken, expiresIn } = generateClientToken(payload);
      expect(accessToken).toBeDefined();
      expect(expiresIn).toBeDefined();

      const decoded = verifyClientToken(accessToken);
      expect(decoded.clientUserId).toBe(payload.clientUserId);
      expect(decoded.clientId).toBe(payload.clientId);
      expect(decoded.tenantId).toBe(payload.tenantId);
      expect(decoded.role).toBe('Client');
      expect(decoded.isClient).toBe(true);
    });

    it('should generate a 6-digit numeric OTP with 10 minutes validity', () => {
      const otp = generateOtp();
      expect(otp.code).toMatch(/^\d{6}$/);
      expect(otp.expiresAt.getTime()).toBeGreaterThan(Date.now() + 8 * 60 * 1000);
      expect(otp.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000 + 1000);
    });

    it('should generate a 32-byte hex magic link token with 15 minutes validity', () => {
      const magic = generateMagicLinkToken();
      expect(magic.token).toHaveLength(64); // 32 bytes in hex = 64 characters
      expect(magic.expiresAt.getTime()).toBeGreaterThan(Date.now() + 13 * 60 * 1000);
    });
  });

  describe('Portal Authentication Endpoints', () => {
    it('POST /api/v1/portal/auth/login should reject missing or invalid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/portal/auth/login')
        .send({
          emailOrPhone: 'nonexistent.client@example.com',
          password: 'WrongPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('POST /api/v1/portal/auth/request-otp should reject unknown identifier with 404', async () => {
      const res = await request(app)
        .post('/api/v1/portal/auth/request-otp')
        .send({
          identifier: '9999999999',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('POST /api/v1/portal/auth/verify-otp should reject invalid code format or non-existent session', async () => {
      const res = await request(app)
        .post('/api/v1/portal/auth/verify-otp')
        .send({
          identifier: 'unknown@example.com',
          code: '123456',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_OTP');
    });

    it('GET /api/v1/portal/profile should reject unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/portal/profile');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('Security Boundary Shield', () => {
    it('Staff authenticate middleware should reject client tokens attempting to access internal staff routes', async () => {
      const clientToken = generateClientToken({
        clientUserId: '6adc83e477289e476175c501',
        clientId: '6adc83e477289e476175c5f0',
        tenantId: '6adc83e477289e476175c5aa',
        role: 'Client',
        isClient: true,
        tokenVersion: 0,
      }).accessToken;

      // Try hitting an internal staff route (/api/v1/tasks) with the client token
      const res = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_CLIENT_ACCESS');
    });
  });
});
