import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas';
import { Task } from '../models/Task';
import { Invoice } from '../models/Invoice';
import { getNextInvoiceNumber } from '../services/sequence.service';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 40-43: Financials - Billing & Invoicing', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminToken: string;
  let clientId: string;
  let taskId1: string;
  let taskId2: string;
  let invoiceId: string;

  const orgSlug = 'billingorg-phase40';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'billingadmin' }).setOptions({ skipTenantPlugin: true });

    try { await Task.collection.drop(); } catch (e) {}
    const org = new Organization({ name: 'Billing Org', slug: orgSlug });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    // Super Admin Role
    const superRole = new Role({ tenantId: orgId, name: 'Super Admin', isSuperAdmin: true, permissions: {} });
    await superRole.save();

    // Admin User
    const adminUser = new User({ tenantId: orgId, name: 'Admin', username: 'billingadmin', password: 'password', roleId: superRole._id });
    await adminUser.save();

    // Login Admin
    const res = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'billingadmin', password: 'password' });
    adminToken = res.body.data.accessToken;

    // Create Client
    const client = new Client({ tenantId: orgId, name: 'Billing Client', entityType: 'Individual' });
    const savedClient = await client.save();
    clientId = savedClient._id.toString();

    // Create 2 Tasks
    const task1 = new Task({ tenantId: orgId, clientId, title: 'Task 1', status: 'Completed', isBilled: false, billingAmount: 1000 });
    const savedTask1 = await task1.save();
    taskId1 = savedTask1._id.toString();

    const task2 = new Task({ tenantId: orgId, clientId, title: 'Task 2', status: 'Completed', isBilled: false, billingAmount: 2000 });
    const savedTask2 = await task2.save();
    taskId2 = savedTask2._id.toString();
  });

  afterAll(async () => {
    await Invoice.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Task.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Client.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'billingadmin' }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  describe('Phase 40: Sequence Generator', () => {
    it('should generate concurrent unique invoice numbers safely', async () => {
      const results = await Promise.all([
        getNextInvoiceNumber(orgId, 'INV-'),
        getNextInvoiceNumber(orgId, 'INV-'),
        getNextInvoiceNumber(orgId, 'INV-')
      ]);

      expect(results).toContain('INV-001');
      expect(results).toContain('INV-002');
      expect(results).toContain('INV-003');
      expect(new Set(results).size).toBe(3); // All unique
    });
  });

  describe('Phase 41: Unbilled Tasks API', () => {
    it('should fetch unbilled completed tasks for a client', async () => {
      const res = await request(app)
        .get(`/api/v1/invoices/unbilled/${clientId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      const ids = res.body.data.map((t: any) => t._id);
      expect(ids).toContain(taskId1);
      expect(ids).toContain(taskId2);
    });
  });

  describe('Phase 42: Invoice Creation & Post-Save Hook', () => {
    it('should create an invoice and automatically mark tasks as billed', async () => {
      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientId,
          date: new Date().toISOString(),
          items: [
            {
              referenceType: 'Task',
              referenceId: taskId1,
              particulars: 'Task 1 Services',
              quantity: 1,
              rate: 1000,
              gstPercentage: 18
            },
            {
              referenceType: 'Manual',
              particulars: 'Extra Consultation',
              quantity: 2,
              rate: 500,
              gstPercentage: 18
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.invoiceNo).toBe('INV-004'); // From previous test sequence
      expect(res.body.data.totals.subtotal).toBe(2000); // 1000 + (2 * 500)
      expect(res.body.data.totals.totalGst).toBe(360); // 18% of 2000
      expect(res.body.data.totals.grandTotal).toBe(2360);

      invoiceId = res.body.data._id;

      // Verify task1 is billed
      const t1 = await Task.findById(taskId1);
      expect(t1?.isBilled).toBe(true);
      expect(t1?.invoiceId?.toString()).toBe(invoiceId);

      // Verify task2 is STILL NOT billed (was not in invoice items)
      const t2 = await Task.findById(taskId2);
      expect(t2?.isBilled).toBe(false);
    });
  });

  describe('Phase 43: Invoice Cancellation', () => {
    it('should cancel invoice and unlock the tasks', async () => {
      const res = await request(app)
        .delete(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Cancelled');
      expect(res.body.data.totals.amountDue).toBe(0);

      // Verify task1 is NO LONGER billed
      const t1 = await Task.findById(taskId1);
      expect(t1?.isBilled).toBe(false);
      expect(t1?.invoiceId).toBeUndefined();

      // Verify it appears back in unbilled tasks list
      const unbilledRes = await request(app)
        .get(`/api/v1/invoices/unbilled/${clientId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(unbilledRes.body.data.length).toBe(2);
    });
  });
});
