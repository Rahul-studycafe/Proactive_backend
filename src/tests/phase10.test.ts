import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../models/Organization';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { BillingEntity } from '../models/BillingEntity';
import { TenantSettings } from '../models/TenantSettings';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 10: Auth Endpoints (Login)', () => {
  let orgId: mongoose.Types.ObjectId;
  let accessToken: string;
  let refreshToken: string;
  const testPassword = 'securePassword123';
  const orgSlug = 'test-auth-org';
  const username = 'auth_tester';

  beforeAll(async () => {
    await connectDB();
    
    // Clear old data
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username }).setOptions({ skipTenantPlugin: true });

    // 1. Create Organization
    const org = new Organization({
      name: 'Auth Test Org',
      slug: orgSlug,
      plan: { maxUsers: 5 }
    });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    // 2. Create Role
    const role = new Role({
      tenantId: orgId,
      name: 'Admin',
      isSuperAdmin: true,
      permissions: {}
    });
    const savedRole = await role.save();

    // 3. Create User
    const user = new User({
      tenantId: orgId,
      name: 'Auth Tester',
      username,
      password: testPassword,
      roleId: savedRole._id,
      tokenVersion: 1
    });
    await user.save();
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should successfully login and return tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        orgSlug,
        username,
        password: testPassword
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.username).toBe(username);
    expect(res.body.data.organization.slug).toBe(orgSlug);

    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('should fail login with invalid password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        orgSlug,
        username,
        password: 'wrongPassword!'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should fail login with invalid org slug', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        orgSlug: 'non-existent-org',
        username,
        password: testPassword
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });


});
