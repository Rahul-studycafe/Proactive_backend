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

describe('Phase 17: User Creation API', () => {
  let orgId: mongoose.Types.ObjectId;
  let superAdminToken: string;
  let adminRoleId: string;
  let limitedUserToken: string;

  const orgSlug = 'phase17-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: { $in: ['admin_user17', 'limited_user17', 'new_user_17'] } }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Test Org 17', slug: orgSlug, plan: { maxUsers: 5 } });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const superRole = new Role({ tenantId: orgId, name: 'Super Admin', isSuperAdmin: true, permissions: {} });
    const savedSuperRole = await superRole.save();
    adminRoleId = savedSuperRole._id.toString();

    const superUser = new User({ tenantId: orgId, name: 'Admin', username: 'admin_user17', password: 'password', roleId: savedSuperRole._id });
    await superUser.save();

    const limitedRole = new Role({
      tenantId: orgId,
      name: 'Limited Role',
      isSuperAdmin: false,
      permissions: {
        user: { create: { allowed: false, scope: 'everything' } }
      }
    });
    const savedLimitedRole = await limitedRole.save();

    const limitedUser = new User({ tenantId: orgId, name: 'Limited', username: 'limited_user17', password: 'password', roleId: savedLimitedRole._id });
    await limitedUser.save();

    const adminLogin = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'admin_user17', password: 'password' });
    superAdminToken = adminLogin.body.data.accessToken;

    const limitedLogin = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'limited_user17', password: 'password' });
    limitedUserToken = limitedLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: { $in: ['admin_user17', 'limited_user17', 'new_user_17'] } }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should reject non-admin from creating user', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${limitedUserToken}`)
      .send({
        name: 'New User',
        username: 'new_user_17',
        password: 'securePassword1',
        confirmPassword: 'securePassword1',
        roleId: adminRoleId
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should allow Super Admin to create a new user', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'New User',
        username: 'new_user_17',
        password: 'securePassword1',
        confirmPassword: 'securePassword1',
        roleId: adminRoleId,
        mobile: '1234567890',
        isActive: true
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe('new_user_17');
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('should reject creation if passwords do not match', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'New User 2',
        username: 'new_user_17_2',
        password: 'securePassword1',
        confirmPassword: 'wrongPassword',
        roleId: adminRoleId
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
