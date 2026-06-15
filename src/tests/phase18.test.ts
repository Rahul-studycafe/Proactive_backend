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

describe('Phase 18: User Read APIs', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminToken: string;
  let testUser1Id: string;
  let testUser2Id: string;
  const orgSlug = 'phase18-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: { $in: ['admin18', 'test1_18', 'test2_18'] } }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Org 18', slug: orgSlug });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const superRole = new Role({ tenantId: orgId, name: 'Super Admin', isSuperAdmin: true, permissions: {} });
    const savedSuperRole = await superRole.save();

    const adminUser = new User({ tenantId: orgId, name: 'Admin', username: 'admin18', password: 'password', roleId: savedSuperRole._id });
    await adminUser.save();

    const testUser1 = new User({ tenantId: orgId, name: 'Test User One', username: 'test1_18', email: 'test1@test.com', password: 'password', roleId: savedSuperRole._id });
    const savedUser1 = await testUser1.save();
    testUser1Id = savedUser1._id.toString();

    const testUser2 = new User({ tenantId: orgId, name: 'Test User Two', username: 'test2_18', email: 'test2@test.com', password: 'password', roleId: savedSuperRole._id });
    const savedUser2 = await testUser2.save();
    testUser2Id = savedUser2._id.toString();

    const loginRes = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'admin18', password: 'password' });
    adminToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: { $in: ['admin18', 'test1_18', 'test2_18'] } }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should list users with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/users?page=1&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.users).toBeInstanceOf(Array);
    expect(res.body.data.users.length).toBeLessThanOrEqual(2);
    expect(res.body.data.pagination).toBeDefined();
    
    // Ensure passwords are not returned
    expect(res.body.data.users[0].password).toBeUndefined();
    // Ensure roleId is populated
    expect(res.body.data.users[0].roleId).toHaveProperty('name');
  });

  it('should filter users by search term', async () => {
    const res = await request(app)
      .get('/api/v1/users?search=test1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.users.length).toBe(1);
    expect(res.body.data.users[0].username).toBe('test1_18');
  });

  it('should fetch a single user by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/users/${testUser1Id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user._id).toBe(testUser1Id);
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.roleId).toHaveProperty('name');
  });

  it('should return 404 for invalid user ID format or not found', async () => {
    const res = await request(app)
      .get(`/api/v1/users/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });
});
