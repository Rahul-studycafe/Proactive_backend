import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../models/Organization';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { TenantSettings } from '../models/TenantSettings';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 22-26: Masters & Settings APIs', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminToken: string;
  let testTagId: string;
  const orgSlug = 'phase22-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'admin22' }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Org 22', slug: orgSlug });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const superRole = new Role({ tenantId: orgId, name: 'Super Admin', isSuperAdmin: true, permissions: {} });
    const savedSuperRole = await superRole.save();

    const adminUser = new User({ tenantId: orgId, name: 'Admin', username: 'admin22', password: 'password', roleId: savedSuperRole._id });
    await adminUser.save();

    const loginRes = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'admin22', password: 'password' });
    adminToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'admin22' }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  describe('Standard Masters CRUD (Tags)', () => {
    it('should create a new tag', async () => {
      const res = await request(app)
        .post('/api/v1/masters/tags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'VIP Client', color: '#FF0000' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('VIP Client');
      expect(res.body.data.color).toBe('#FF0000');
      testTagId = res.body.data._id;
    });

    it('should list all tags', async () => {
      const res = await request(app)
        .get('/api/v1/masters/tags')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should update a tag', async () => {
      const res = await request(app)
        .put(`/api/v1/masters/tags/${testTagId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Super VIP', color: '#00FF00', isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Super VIP');
      expect(res.body.data.isActive).toBe(false);
    });

    it('should delete a tag', async () => {
      const res = await request(app)
        .delete(`/api/v1/masters/tags/${testTagId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Tenant Settings & Custom Fields', () => {
    it('should fetch settings and auto-create if missing', async () => {
      const res = await request(app)
        .get('/api/v1/masters/settings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenantId.toString()).toBe(orgId.toString());
      expect(Array.isArray(res.body.data.clientCustomFields)).toBe(true);
    });

    it('should update top-level settings', async () => {
      const res = await request(app)
        .put('/api/v1/masters/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ allowDuplicateClientNames: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.allowDuplicateClientNames).toBe(true);
    });

    it('should add a custom field definition', async () => {
      const res = await request(app)
        .post('/api/v1/masters/settings/client-custom-fields')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ label: 'GSTIN', fieldType: 'text', isRequired: true });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[res.body.data.length - 1].label).toBe('GSTIN');
      expect(res.body.data[res.body.data.length - 1].fieldType).toBe('text');
    });

    it('should update a custom field definition', async () => {
      const settings = await TenantSettings.findOne({ tenantId: orgId });
      const lastIndex = settings!.clientCustomFields.length - 1;

      const res = await request(app)
        .put(`/api/v1/masters/settings/client-custom-fields/${lastIndex}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ label: 'GST Number', fieldType: 'text', isRequired: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[lastIndex].label).toBe('GST Number');
    });

    it('should remove a custom field definition', async () => {
      const settings = await TenantSettings.findOne({ tenantId: orgId });
      const lastIndex = settings!.clientCustomFields.length - 1;

      const res = await request(app)
        .delete(`/api/v1/masters/settings/client-custom-fields/${lastIndex}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const updatedSettings = await TenantSettings.findOne({ tenantId: orgId });
      expect(updatedSettings!.clientCustomFields.length).toBe(settings!.clientCustomFields.length - 1);
    });
  });

  describe('Bootstrap Endpoint', () => {
    it('should return all masters in a single payload', async () => {
      // First, create a dummy ClientGroup
      await request(app)
        .post('/api/v1/masters/client-groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Retailers' });

      const res = await request(app)
        .get('/api/v1/masters/bootstrap')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      const { data } = res.body;
      expect(Array.isArray(data.tags)).toBe(true);
      expect(Array.isArray(data.clientGroups)).toBe(true);
      expect(Array.isArray(data.paymentModes)).toBe(true);
      expect(Array.isArray(data.expenseCategories)).toBe(true);
      expect(Array.isArray(data.documentTypes)).toBe(true);
      expect(Array.isArray(data.holidays)).toBe(true);
      expect(Array.isArray(data.roles)).toBe(true);
      expect(Array.isArray(data.users)).toBe(true);
      
      expect(data.tenantSettings).toBeDefined();
      expect(data.billingEntity).toBeDefined();

      // Verify the Retailers group is there
      expect(data.clientGroups.some((g: any) => g.name === 'Retailers')).toBe(true);
    });
  });
});
