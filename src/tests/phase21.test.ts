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

describe('Phase 21: Role Read & Delete API', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminToken: string;
  let superRoleId: string;
  let testRoleId: string;
  const orgSlug = 'phase21-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'admin21' }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Org 21', slug: orgSlug });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const superRole = new Role({ tenantId: orgId, name: 'Super Admin', isSuperAdmin: true, permissions: {} });
    const savedSuperRole = await superRole.save();
    superRoleId = savedSuperRole._id.toString();

    const adminUser = new User({ tenantId: orgId, name: 'Admin', username: 'admin21', password: 'password', roleId: savedSuperRole._id });
    await adminUser.save();

    const loginRes = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'admin21', password: 'password' });
    adminToken = loginRes.body.data.accessToken;

    // Create a dummy role for testing read & delete
    const dummyRole = new Role({ tenantId: orgId, name: 'Test Role 21', isSuperAdmin: false, permissions: {} });
    const savedDummyRole = await dummyRole.save();
    testRoleId = savedDummyRole._id.toString();
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'admin21' }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should fetch all roles and include assignedUsersCount', async () => {
    const res = await request(app)
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.roles.length).toBeGreaterThanOrEqual(2); // Super Admin + Test Role 21
    
    const superAdminRole = res.body.data.roles.find((r: any) => r.name === 'Super Admin');
    expect(superAdminRole.assignedUsersCount).toBe(1); // admin21 is assigned
    
    const testRole = res.body.data.roles.find((r: any) => r.name === 'Test Role 21');
    expect(testRole.assignedUsersCount).toBe(0);
  });

  it('should prevent deleting the Super Admin role', async () => {
    const res = await request(app)
      .delete(`/api/v1/roles/${superRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('cannot be deleted');
  });

  it('should prevent deleting a role that is in use', async () => {
    // Assign a dummy user to testRoleId
    const dummyUser = new User({ tenantId: orgId, name: 'Dummy', username: 'dummy_user21', password: 'password', roleId: testRoleId });
    await dummyUser.save();

    const res = await request(app)
      .delete(`/api/v1/roles/${testRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ROLE_IN_USE');

    // Clean up
    await User.findByIdAndDelete(dummyUser._id);
  });

  it('should delete an unused role successfully', async () => {
    const res = await request(app)
      .delete(`/api/v1/roles/${testRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
