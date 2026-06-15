import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas';
import { Service } from '../modules/services/schemas';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 27-33: CRM Clients & Services APIs', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminToken: string;
  let testClientId: string;
  let testServiceId: string;
  const orgSlug = 'phase27-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'admin27' }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Org 27', slug: orgSlug });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const superRole = new Role({ tenantId: orgId, name: 'Super Admin', isSuperAdmin: true, permissions: {} });
    const savedSuperRole = await superRole.save();

    const adminUser = new User({ tenantId: orgId, name: 'Admin', username: 'admin27', password: 'password', roleId: savedSuperRole._id });
    await adminUser.save();

    const loginRes = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'admin27', password: 'password' });
    adminToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await Client.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Service.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'admin27' }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  describe('Service Management (Blueprints)', () => {
    it('should create a new service', async () => {
      const res = await request(app)
        .post('/api/v1/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'GST Monthly Filing',
          isRecurring: true,
          frequency: {
            type: 'monthly',
            creationDay: 1,
            dueDay: 20,
            periodLogic: 'recently_completed'
          },
          checklist: [
            { stepName: 'Collect Data', orderIndex: 1 },
            { stepName: 'File Return', orderIndex: 2 }
          ],
          defaultBillingRate: 1500
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('GST Monthly Filing');
      expect(res.body.data.checklist.length).toBe(2);
      testServiceId = res.body.data._id;
    });

    it('should get all services', async () => {
      const res = await request(app)
        .get('/api/v1/services')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Client Management', () => {
    it('should create a new client with custom fields', async () => {
      const res = await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Acme Corp',
          entityType: 'Private Limited',
          email: 'hello@acme.com',
          pan: 'ABCDE1234F',
          customFieldValues: {
            'Director Name': 'John Doe'
          },
          subscribedServices: [
            {
              serviceId: testServiceId,
              customPrice: 2000
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Acme Corp');
      expect(res.body.data.customFieldValues['Director Name']).toBe('John Doe');
      expect(res.body.data.subscribedServices.length).toBe(1);
      expect(res.body.data.subscribedServices[0].customPrice).toBe(2000);
      testClientId = res.body.data._id;
    });

    it('should get clients with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/clients?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.clients.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('should search clients by name', async () => {
      const res = await request(app)
        .get('/api/v1/clients?search=Acme')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.clients.length).toBe(1);
      expect(res.body.data.clients[0].name).toBe('Acme Corp');
    });

    it('should update a client', async () => {
      const res = await request(app)
        .put(`/api/v1/clients/${testClientId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Acme Corporation'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Acme Corporation');
    });

    it('should soft delete a client', async () => {
      const res = await request(app)
        .delete(`/api/v1/clients/${testClientId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
    });
  });
});
