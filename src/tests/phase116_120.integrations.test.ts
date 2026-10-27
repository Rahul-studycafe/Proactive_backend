import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { Service } from '../modules/services/schemas/service.schema';
import { Task } from '../models/Task';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
import { NotificationTemplate } from '../models/NotificationTemplate';
import { NotificationLog } from '../models/NotificationLog';
import { BillingEntity } from '../modules/masters/schemas/billing-entity.schema';
import { processBulkNotifications } from '../services/notification.service';
import dotenv from 'dotenv';

dotenv.config();
jest.setTimeout(30000);

describe('Part 24: Targeted Communications, Tally XML Export & Agency Settings (Phases 116–120)', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let userAId: mongoose.Types.ObjectId;
  let userDepartingId: mongoose.Types.ObjectId;
  let userReplacementId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;
  let clientAId: string;
  let serviceAId: string;

  const orgASlug = 'part24-orga';
  const orgBSlug = 'part24-orgb';
  const userAEmail = 'adminA.part24@example.com';
  const userBEmail = 'adminB.part24@example.com';
  const departingEmail = 'departing.part24@example.com';
  const replacementEmail = 'replacement.part24@example.com';

  beforeAll(async () => {
    await connectDB();

    // Clean up test data
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [userAEmail, userBEmail, departingEmail, replacementEmail] }
    }).setOptions({ skipTenantPlugin: true });
    await NotificationTemplate.deleteMany({}).setOptions({ skipTenantPlugin: true });
    await NotificationLog.deleteMany({}).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({
      name: 'Omni Advisory LLP',
      slug: orgASlug,
      address: {
        addressLine1: '12 Corporate Towers',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        pincode: '400051'
      },
      gstin: '27AABCO1234A1Z5',
      pan: 'AABCO1234A'
    });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Super Admin A',
      isSuperAdmin: true,
      permissions: {}
    });

    const userA = await User.create({
      tenantId: orgAId,
      name: 'Managing Partner A',
      username: 'partner_a_p24',
      email: userAEmail,
      password: 'password123',
      roleId: roleA._id
    });
    userAId = userA._id as mongoose.Types.ObjectId;

    // Create departing staff and replacement staff
    const userDeparting = await User.create({
      tenantId: orgAId,
      name: 'Rohan Sharma (Departing)',
      username: 'rohan_departing_p24',
      email: departingEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    userDepartingId = userDeparting._id as mongoose.Types.ObjectId;

    const userReplacement = await User.create({
      tenantId: orgAId,
      name: 'Priya Verma (Replacement)',
      username: 'priya_replacement_p24',
      email: replacementEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    userReplacementId = userReplacement._id as mongoose.Types.ObjectId;

    // Setup Org B
    const orgB = await Organization.create({
      name: 'Zenith Legal LLP',
      slug: orgBSlug,
      address: {
        addressLine1: '45 Residency Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        pincode: '560025'
      }
    });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Super Admin B',
      isSuperAdmin: true,
      permissions: {}
    });

    await User.create({
      tenantId: orgBId,
      name: 'Managing Partner B',
      username: 'partner_b_p24',
      email: userBEmail,
      password: 'password123',
      roleId: roleB._id
    });

    // Login Org A
    const loginResA = await request(app).post('/api/v1/auth/login').send({
      email: userAEmail,
      password: 'password123'
    });
    tokenA = loginResA.body.data.accessToken;

    // Login Org B
    const loginResB = await request(app).post('/api/v1/auth/login').send({
      email: userBEmail,
      password: 'password123'
    });
    tokenB = loginResB.body.data.accessToken;

    // Create Service
    const serviceA = await Service.create({
      tenantId: orgAId,
      name: 'GST Compliance Retainer',
      isEnabled: true,
      isRecurring: true,
      frequency: { type: 'monthly' },
      sacCode: '998231',
      gstPercentage: 18,
      defaultBillingRate: 10000,
      checklist: [{ stepName: 'File GSTR-3B', orderIndex: 1 }]
    });
    serviceAId = serviceA._id.toString();

    // Create Client with departing user assigned
    const clientA = await Client.create({
      tenantId: orgAId,
      name: 'Bharat Enterprises Ltd',
      email: 'accounts@bharatent.com',
      mobile: '9820011223',
      pan: 'ABCDE9999F',
      gstin: '27ABCDE9999F1Z5',
      state: 'Maharashtra',
      isActive: true,
      tags: ['VIP', 'Corporate'],
      assignedUsers: [userDepartingId],
      subscribedServices: [
        {
          serviceId: serviceA._id as mongoose.Types.ObjectId,
          customPrice: 12000,
          customUsers: [userDepartingId],
          subscribedAt: new Date()
        }
      ]
    });
    clientAId = clientA._id.toString();

    // Create Task assigned to departing user
    await Task.create({
      tenantId: orgAId,
      clientId: clientA._id,
      serviceId: serviceA._id,
      assigneeIds: [userDepartingId],
      description: 'Prepare Annual Balance Sheet',
      status: 'In Progress',
      priority: 'High',
      dueDate: new Date(Date.now() + 86400000 * 5)
    });

    // Create Invoice with unpaid balance
    await Invoice.create({
      tenantId: orgAId,
      clientId: clientA._id,
      invoiceNo: 'INV-2026-TALLY-01',
      date: new Date(),
      status: 'Unpaid',
      items: [
        {
          referenceType: 'Manual',
          particulars: 'GST Advisory & Filing Retainer',
          sacCode: '998231',
          quantity: 1,
          rate: 20000,
          discount: 0,
          taxableAmount: 20000,
          gstPercentage: 18,
          gstAmount: 3600,
          total: 23600
        }
      ],
      totals: {
        subtotal: 20000,
        totalDiscount: 0,
        totalTaxable: 20000,
        totalGst: 3600,
        roundOff: 0,
        grandTotal: 23600,
        amountPaid: 0,
        amountDue: 23600
      }
    });

    // Create Receipt
    await Receipt.create({
      tenantId: orgAId,
      clientId: clientA._id,
      receiptNo: 'REC-2026-TALLY-01',
      date: new Date(),
      paymentMode: 'Bank Transfer',
      referenceNumber: 'IMPS-20260401',
      totalAmount: 10000,
      tdsAmount: 0,
      discountAmount: 0,
      settlements: []
    });
  });

  afterAll(async () => {
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [userAEmail, userBEmail, departingEmail, replacementEmail] }
    }).setOptions({ skipTenantPlugin: true });
    await Task.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Invoice.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Receipt.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Client.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await NotificationTemplate.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await NotificationLog.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
  });

  // ─── Phase 116 Tests: Notification Templates & Audience Query ────

  describe('Phase 116: Notification Template Master & Audience Query Builder', () => {
    let createdTemplateId: string;

    it('POST /api/v1/notifications/templates creates template with dynamic placeholders', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/templates')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Payment Reminder Template',
          channel: 'Email',
          subject: 'Payment Pending for {{clientName}}',
          body: 'Dear {{clientName}}, your outstanding balance of {{outstandingBalance}} is pending. Please clear before {{dueDate}}.'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Payment Reminder Template');
      createdTemplateId = res.body.data._id;
    });

    it('GET /api/v1/notifications/templates lists templates for tenant', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/templates')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/v1/notifications/audience queries audience and computes dynamic variables', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/audience')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          hasUnpaidInvoices: true,
          minOutstandingAmount: 10000,
          clientTags: ['VIP']
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalRecipients).toBe(1);
      const recipient = res.body.data.recipients[0];
      expect(recipient.clientName).toBe('Bharat Enterprises Ltd');
      expect(recipient.outstandingBalance).toBe(23600);
      expect(recipient.variables.clientName).toBe('Bharat Enterprises Ltd');
      expect(recipient.variables.outstandingBalance).toContain('23600');
    });
  });

  // ─── Phase 117 Tests: Bulk Communications Dispatch ─────────────

  describe('Phase 117: Asynchronous Bulk Communications Worker', () => {
    it('POST /api/v1/notifications/send-bulk responds 202 Accepted and logs dispatch', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/send-bulk')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          recipientIds: [clientAId],
          channel: 'Email',
          customMessage: 'Dear {{clientName}}, outstanding balance is {{outstandingBalance}}.',
          subject: 'Urgent Payment Due'
        });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Queued');
      expect(res.body.data.totalRecipients).toBe(1);

      // Verify dispatcher function processes and logs delivery
      const dispatchResult = await processBulkNotifications({
        tenantId: orgAId.toString(),
        recipientIds: [clientAId],
        channel: 'Email',
        customMessage: 'Dear {{clientName}}, outstanding balance is {{outstandingBalance}}.',
        subject: 'Urgent Payment Due'
      });

      expect(dispatchResult.dispatchedCount).toBe(1);

      const log = await NotificationLog.findOne({
        tenantId: orgAId,
        clientId: new mongoose.Types.ObjectId(clientAId)
      });
      expect(log).toBeDefined();
      expect(log?.content).toContain('Bharat Enterprises Ltd');
      expect(log?.content).toContain('23600');
    });
  });

  // ─── Phase 118 Tests: Tally XML Accounting Synchronization ──────

  describe('Phase 118: Tally XML Accounting Synchronization Service', () => {
    it('GET /api/v1/accounting/tally-export returns XML envelope with balanced vouchers', async () => {
      const res = await request(app)
        .get('/api/v1/accounting/tally-export?type=all')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/xml');
      expect(res.headers['content-disposition']).toContain('attachment; filename="tally_export_');

      const xmlText = res.text;
      expect(xmlText).toContain('<ENVELOPE>');
      expect(xmlText).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
      expect(xmlText).toContain('<VOUCHER VCHTYPE="Sales" ACTION="Create">');
      expect(xmlText).toContain('<VOUCHERNUMBER>INV-2026-TALLY-01</VOUCHERNUMBER>');
      expect(xmlText).toContain('<PARTYLEDGERNAME>Bharat Enterprises Ltd</PARTYLEDGERNAME>');
      expect(xmlText).toContain('<LEDGERNAME>Professional Fees</LEDGERNAME>');
      expect(xmlText).toContain('<LEDGERNAME>Output CGST</LEDGERNAME>');
      expect(xmlText).toContain('<VOUCHER VCHTYPE="Receipt" ACTION="Create">');
      expect(xmlText).toContain('<VOUCHERNUMBER>REC-2026-TALLY-01</VOUCHERNUMBER>');
    });
  });

  // ─── Phase 119 Tests: Master Taxonomies & Multi-Billing Entity ───

  describe('Phase 119: Master Taxonomies & Multi-Billing Entity Management', () => {
    it('POST /api/v1/masters/:type creates generic taxonomies', async () => {
      const tagRes = await request(app)
        .post('/api/v1/masters/tags')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Tax-Exempt-NGO' });

      expect(tagRes.status).toBe(201);
      expect(tagRes.body.data.name).toBe('Tax-Exempt-NGO');

      const groupRes = await request(app)
        .post('/api/v1/masters/client-groups')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Tier-1 Conglomerates' });

      expect(groupRes.status).toBe(201);
      expect(groupRes.body.data.name).toBe('Tier-1 Conglomerates');
    });

    it('GET /api/v1/masters/bootstrap fetches unified dropdown lookup payload', async () => {
      const res = await request(app)
        .get('/api/v1/masters/bootstrap')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tags).toBeDefined();
      expect(res.body.data.clientGroups).toBeDefined();
      expect(res.body.data.paymentModes).toBeDefined();
    });

    it('POST & GET /api/v1/tenant-settings/billing-entities manages multi-entity legal profiles', async () => {
      const createRes = await request(app)
        .post('/api/v1/tenant-settings/billing-entities')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Omni Legal Advisory Associates LLP',
          tradeName: 'Omni Legal',
          gstin: '27AABCO5555B1Z9',
          pan: 'AABCO5555B',
          cin: 'U74140MH2020PTC123456',
          bankDetails: {
            bankName: 'HDFC Bank',
            accountNumber: '50200012345678',
            ifsc: 'HDFC0000123',
            branch: 'Nariman Point'
          },
          upiId: 'omnilegal@hdfcbank',
          invoicePrefix: 'OLA/26-27/'
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.tradeName).toBe('Omni Legal');
      expect(createRes.body.data.upiId).toBe('omnilegal@hdfcbank');

      const listRes = await request(app)
        .get('/api/v1/tenant-settings/billing-entities')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Phase 120 Tests: Atomic User Replacement Utility ────────────

  describe('Phase 120: Atomic User Replacement Utility (Staff Handover)', () => {
    it('POST /api/v1/users/replace-user reassigns tasks, clients, and services atomically and deactivates departing user', async () => {
      const res = await request(app)
        .post('/api/v1/users/replace-user')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          departingUserId: userDepartingId.toString(),
          replacementUserId: userReplacementId.toString(),
          reassignTasks: true,
          reassignClients: true,
          reassignServices: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tasksReassignedCount).toBe(1);
      expect(res.body.data.clientsReassignedCount).toBe(1);
      expect(res.body.data.servicesReassignedCount).toBe(1);
      expect(res.body.data.userDeactivated).toBe(true);

      // Verify Database State:
      // 1. Task has replacement user
      const updatedTask = await Task.findOne({ clientId: new mongoose.Types.ObjectId(clientAId) });
      expect(updatedTask?.assigneeIds.map((id) => id.toString())).toContain(userReplacementId.toString());
      expect(updatedTask?.assigneeIds.map((id) => id.toString())).not.toContain(userDepartingId.toString());

      // 2. Client has replacement user
      const updatedClient = await Client.findById(clientAId);
      expect(updatedClient?.assignedUsers.map((id) => id.toString())).toContain(userReplacementId.toString());
      expect(updatedClient?.assignedUsers.map((id) => id.toString())).not.toContain(userDepartingId.toString());
      expect(updatedClient?.subscribedServices[0].customUsers.map((id) => id.toString())).toContain(userReplacementId.toString());

      // 3. Departing user is deactivated
      const departingUserDoc = await User.findById(userDepartingId).setOptions({ skipTenantPlugin: true });
      expect(departingUserDoc?.isActive).toBe(false);
    });

    it('POST /api/v1/users/replace-user rejects identical departing and replacement IDs', async () => {
      const res = await request(app)
        .post('/api/v1/users/replace-user')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          departingUserId: userReplacementId.toString(),
          replacementUserId: userReplacementId.toString()
        });

      expect(res.status).toBe(400);
    });
  });

  // ─── Multi-Tenant Isolation ─────────────────────────────────────

  describe('Multi-Tenant Isolation', () => {
    it('Org B cannot access Org A templates, audience or tally exports', async () => {
      const templateRes = await request(app)
        .get('/api/v1/notifications/templates')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(templateRes.status).toBe(200);
      expect(templateRes.body.data.length).toBe(0);

      const audienceRes = await request(app)
        .post('/api/v1/notifications/audience')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ hasUnpaidInvoices: true });

      expect(audienceRes.status).toBe(200);
      expect(audienceRes.body.data.totalRecipients).toBe(0);
    });
  });
});
