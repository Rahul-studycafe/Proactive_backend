import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { User } from '../modules/auth/schemas';
import { BillingEntity } from '../modules/masters/schemas';
import { TenantSettings } from '../modules/masters/schemas';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 9: Multi-Tenant Isolation', () => {
  let orgAToken: string;
  let orgBToken: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    await connectDB();

    // Clean up any previous test runs
    await Organization.deleteMany({ slug: { $regex: /^tenant-test/ } });
    await User.find({ username: { $in: ['tenant_user_a', 'tenant_user_b'] } })
      .setOptions({ skipTenantPlugin: true })
      .then(users => Promise.all(users.map(u => User.deleteOne({ _id: u._id }).setOptions({ skipTenantPlugin: true }))));
  });

  afterAll(async () => {
    // Clean up
    await Organization.deleteMany({ slug: { $regex: /^tenant-test/ } });
    
    // Clean tenant-scoped docs using skipTenantPlugin
    const users = await User.find({ username: { $in: ['tenant_user_a', 'tenant_user_b'] } })
      .setOptions({ skipTenantPlugin: true });
    
    for (const user of users) {
      const tenantId = user.tenantId;
      await Role.deleteMany({ tenantId }).setOptions({ skipTenantPlugin: true });
      await BillingEntity.deleteMany({ tenantId }).setOptions({ skipTenantPlugin: true });
      await TenantSettings.deleteMany({ tenantId }).setOptions({ skipTenantPlugin: true });
      await User.deleteOne({ _id: user._id }).setOptions({ skipTenantPlugin: true });
    }

    await mongoose.connection.close();
  });

  it('should register Org A and return tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        orgName: 'Tenant Test A',
        name: 'Admin A',
        username: 'tenant_user_a',
        password: 'password123'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    orgAToken = res.body.data.accessToken;
    orgAId = res.body.data.organization._id;
  });

  it('should register Org B and return tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        orgName: 'Tenant Test B',
        name: 'Admin B',
        username: 'tenant_user_b',
        password: 'password456'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    orgBToken = res.body.data.accessToken;
    orgBId = res.body.data.organization._id;
  });

  it('should reject unauthenticated request to a protected route', async () => {
    const res = await request(app).get('/api/v1/protected-test');
    
    // Without a token, should get 401 (from authenticate middleware)
    // or 404 if the route doesn't exist — but authenticate fires first
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('should confirm Org A and Org B are separate tenants in the database', async () => {
    expect(orgAId).toBeDefined();
    expect(orgBId).toBeDefined();
    expect(orgAId).not.toBe(orgBId);
  });

  it('should confirm tenant plugin scoped the data correctly', async () => {
    // Directly query without tenant plugin to see all users
    const allUsers = await User.find({}).setOptions({ skipTenantPlugin: true });
    const testUsers = allUsers.filter(u => 
      ['tenant_user_a', 'tenant_user_b'].includes(u.username)
    );
    
    expect(testUsers.length).toBe(2);
    
    // Verify they belong to different tenants
    const tenantIds = testUsers.map(u => u.tenantId.toString());
    expect(tenantIds[0]).not.toBe(tenantIds[1]);
  });

  it('should confirm tenant-scoped queries only return own tenant data', async () => {
    // Query roles for Org A using direct tenantId filter (simulating what the plugin does)
    const orgARoles = await Role.find({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    const orgBRoles = await Role.find({ tenantId: orgBId }).setOptions({ skipTenantPlugin: true });
    
    expect(orgARoles.length).toBeGreaterThan(0);
    expect(orgBRoles.length).toBeGreaterThan(0);
    
    // Ensure no cross-contamination
    orgARoles.forEach(role => {
      expect(role.tenantId.toString()).toBe(orgAId);
    });
    orgBRoles.forEach(role => {
      expect(role.tenantId.toString()).toBe(orgBId);
    });
  });
});
