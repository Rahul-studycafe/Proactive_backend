import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../models/Organization';
import { Role } from '../models/Role';
import { User } from '../models/User';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 19: User Update & Deactivation API', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminToken: string;
  let testUserToken: string;
  let testUserId: string;
  let testUserRoleId: string;
  const orgSlug = 'phase19-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: { $in: ['admin19', 'test19'] } }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Org 19', slug: orgSlug });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const superRole = new Role({ tenantId: orgId, name: 'Super Admin', isSuperAdmin: true, permissions: {} });
    const savedSuperRole = await superRole.save();
    testUserRoleId = savedSuperRole._id.toString();

    const adminUser = new User({ tenantId: orgId, name: 'Admin', username: 'admin19', password: 'password', roleId: savedSuperRole._id });
    await adminUser.save();

    const testUser = new User({ tenantId: orgId, name: 'Test User', username: 'test19', password: 'password', roleId: savedSuperRole._id, isActive: true, tokenVersion: 1 });
    const savedTestUser = await testUser.save();
    testUserId = savedTestUser._id.toString();

    const adminLoginRes = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'admin19', password: 'password' });
    adminToken = adminLoginRes.body.data.accessToken;

    const testLoginRes = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'test19', password: 'password' });
    testUserToken = testLoginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: { $in: ['admin19', 'test19'] } }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should update user profile details', async () => {
    const res = await request(app)
      .put(`/api/v1/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Updated Test User',
        mobile: '9876543210'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.name).toBe('Updated Test User');
    expect(res.body.data.user.mobile).toBe('9876543210');
  });

  it('should reject update if passwords do not match', async () => {
    const res = await request(app)
      .put(`/api/v1/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        password: 'newpassword123',
        confirmPassword: 'wrongpassword'
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should deactivate a user and invalidate their token', async () => {
    // 1. Verify test user token currently works
    const checkRes1 = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${testUserToken}`);
    expect(checkRes1.status).toBe(200);

    // 2. Admin deactivates test user
    const updateRes = await request(app)
      .put(`/api/v1/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        isActive: false
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.user.isActive).toBe(false);

    // 3. Verify test user token no longer works
    const checkRes2 = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${testUserToken}`);
    expect(checkRes2.status).toBe(403);
    expect(checkRes2.body.error.message).toContain('deactivated');
  });
});
