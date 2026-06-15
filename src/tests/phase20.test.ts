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

describe('Phase 20: Role Creation & Update API', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminToken: string;
  let superRoleId: string;
  let testRoleId: string;
  const orgSlug = 'phase20-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'admin20' }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Org 20', slug: orgSlug });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const superRole = new Role({ tenantId: orgId, name: 'Super Admin', isSuperAdmin: true, permissions: {} });
    const savedSuperRole = await superRole.save();
    superRoleId = savedSuperRole._id.toString();

    const adminUser = new User({ tenantId: orgId, name: 'Admin', username: 'admin20', password: 'password', roleId: savedSuperRole._id });
    await adminUser.save();

    const loginRes = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'admin20', password: 'password' });
    adminToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'admin20' }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should create a new role with a valid permission matrix', async () => {
    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Accountant',
        permissions: {
          client: {
            view: { allowed: true, scope: 'team_only' },
            create: { allowed: false, scope: 'everything' }
          }
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role.name).toBe('Accountant');
    testRoleId = res.body.data.role._id;
  });

  it('should reject role creation with an invalid permission matrix', async () => {
    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Invalid Role',
        permissions: {
          client: {
            view: { allowed: 'yes', scope: 'invalid_scope' } // Invalid types
          }
        }
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should prevent creating a role with a duplicate name', async () => {
    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Accountant',
        permissions: {}
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROLE_EXISTS');
  });

  it('should update an existing role', async () => {
    const res = await request(app)
      .put(`/api/v1/roles/${testRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Senior Accountant',
        permissions: {
          client: {
            view: { allowed: true, scope: 'everything' },
            create: { allowed: true, scope: 'everything' }
          }
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role.name).toBe('Senior Accountant');
    expect(res.body.data.role.permissions.client.view.scope).toBe('everything');
  });

  it('should prevent updating the Super Admin role', async () => {
    const res = await request(app)
      .put(`/api/v1/roles/${superRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Hacked Admin',
        permissions: {}
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('cannot be modified');
  });
});
