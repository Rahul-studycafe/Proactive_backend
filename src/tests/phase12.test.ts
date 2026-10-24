import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { User } from '../modules/auth/schemas';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 12: Token Refresh & Logout Endpoints', () => {
  let orgId: mongoose.Types.ObjectId;
  let accessToken: string;
  let refreshToken: string;
  const testPassword = 'securePassword123';
  const orgSlug = 'phase12-org';
  const username = 'phase12_tester';
  const testEmail = 'phase12@test.com';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ email: testEmail }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Phase 12 Org', slug: orgSlug, plan: { maxUsers: 5 } });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const role = new Role({ tenantId: orgId, name: 'Admin', isSuperAdmin: true, permissions: {} });
    const savedRole = await role.save();

    const user = new User({ tenantId: orgId, name: 'Phase 12 Tester', username, email: testEmail, password: testPassword, roleId: savedRole._id, tokenVersion: 1 });
    await user.save();

    const res = await request(app).post('/api/v1/auth/login').send({ email: testEmail, password: testPassword });
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ email: testEmail }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should refresh the access token using a valid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('should logout and invalidate the refresh token', async () => {
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error.code).toBe('REVOKED_REFRESH_TOKEN');
  });
});
