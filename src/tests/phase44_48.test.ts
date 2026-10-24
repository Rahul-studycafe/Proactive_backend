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
import { Receipt } from '../models/Receipt';
import { getNextReceiptNumber } from '../services/sequence.service';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 9: Financials - Receipts & Ledger (Phases 44-48)', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminToken: string;
  let clientId: string;
  let unpaidInvoiceId: string;
  let partiallyPaidInvoiceId: string;
  let paidInvoiceId: string;
  let draftInvoiceId: string;

  const orgSlug = 'receiptorg-phase4448';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ email: 'receiptadmin@example.com' }).setOptions({ skipTenantPlugin: true });

    // Clean up collections for this test
    const org = new Organization({ name: 'Receipt Org', slug: orgSlug });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    // Super Admin Role
    const superRole = new Role({
      tenantId: orgId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });
    await superRole.save();

    // Admin User
    const adminUser = new User({
      tenantId: orgId,
      name: 'Admin User',
      username: 'receiptadmin',
      email: 'receiptadmin@example.com',
      password: 'password',
      roleId: superRole._id
    });
    await adminUser.save();

    // Login Admin
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'receiptadmin@example.com', password: 'password' });
    adminToken = loginRes.body.data.accessToken;

    // Create Test Client
    const client = new Client({
      tenantId: orgId,
      name: 'Financial Client Ltd',
      entityType: 'Private Limited',
      openingBalance: 500
    });
    const savedClient = await client.save();
    clientId = savedClient._id.toString();

    // 1. Create Unpaid Invoice
    const inv1 = new Invoice({
      tenantId: orgId,
      clientId,
      invoiceNo: 'INV-TEST-001',
      date: new Date('2026-10-01'),
      status: 'Unpaid',
      items: [
        {
          referenceType: 'Manual',
          particulars: 'Audit Services',
          quantity: 1,
          rate: 1000,
          discount: 0,
          taxableAmount: 1000,
          gstPercentage: 0,
          gstAmount: 0,
          total: 1000
        }
      ],
      totals: {
        subtotal: 1000,
        totalDiscount: 0,
        totalTaxable: 1000,
        totalGst: 0,
        roundOff: 0,
        grandTotal: 1000,
        amountPaid: 0,
        amountDue: 1000
      }
    });
    const savedInv1 = await inv1.save();
    unpaidInvoiceId = savedInv1._id.toString();

    // 2. Create Partially Paid Invoice
    const inv2 = new Invoice({
      tenantId: orgId,
      clientId,
      invoiceNo: 'INV-TEST-002',
      date: new Date('2026-10-05'),
      dueDate: new Date('2026-10-10'), // overdue date
      status: 'Partially Paid',
      items: [
        {
          referenceType: 'Manual',
          particulars: 'Tax Advisory',
          quantity: 1,
          rate: 2000,
          discount: 0,
          taxableAmount: 2000,
          gstPercentage: 0,
          gstAmount: 0,
          total: 2000
        }
      ],
      totals: {
        subtotal: 2000,
        totalDiscount: 0,
        totalTaxable: 2000,
        totalGst: 0,
        roundOff: 0,
        grandTotal: 2000,
        amountPaid: 500,
        amountDue: 1500
      }
    });
    const savedInv2 = await inv2.save();
    partiallyPaidInvoiceId = savedInv2._id.toString();

    // 3. Create Paid Invoice
    const inv3 = new Invoice({
      tenantId: orgId,
      clientId,
      invoiceNo: 'INV-TEST-003',
      date: new Date('2026-10-10'),
      status: 'Paid',
      items: [
        {
          referenceType: 'Manual',
          particulars: 'Consulting',
          quantity: 1,
          rate: 3000,
          discount: 0,
          taxableAmount: 3000,
          gstPercentage: 0,
          gstAmount: 0,
          total: 3000
        }
      ],
      totals: {
        subtotal: 3000,
        totalDiscount: 0,
        totalTaxable: 3000,
        totalGst: 0,
        roundOff: 0,
        grandTotal: 3000,
        amountPaid: 3000,
        amountDue: 0
      }
    });
    const savedInv3 = await inv3.save();
    paidInvoiceId = savedInv3._id.toString();

    // 4. Create Draft Invoice
    const inv4 = new Invoice({
      tenantId: orgId,
      clientId,
      invoiceNo: 'INV-TEST-004',
      date: new Date('2026-10-15'),
      status: 'Draft',
      items: [
        {
          referenceType: 'Manual',
          particulars: 'Draft Task',
          quantity: 1,
          rate: 500,
          discount: 0,
          taxableAmount: 500,
          gstPercentage: 0,
          gstAmount: 0,
          total: 500
        }
      ],
      totals: {
        subtotal: 500,
        totalDiscount: 0,
        totalTaxable: 500,
        totalGst: 0,
        roundOff: 0,
        grandTotal: 500,
        amountPaid: 0,
        amountDue: 500
      }
    });
    const savedInv4 = await inv4.save();
    draftInvoiceId = savedInv4._id.toString();
  });

  afterAll(async () => {
    await Receipt.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Invoice.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Task.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Client.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ email: 'receiptadmin@example.com' }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  // ─── Phase 44: Receipt Model, Sequence & Unpaid Invoices ──────
  describe('Phase 44: Receipt Model & Unpaid Invoices API', () => {
    it('should generate consecutive unique receipt numbers', async () => {
      const rct1 = await getNextReceiptNumber(orgId, 'RCT-');
      const rct2 = await getNextReceiptNumber(orgId, 'RCT-');
      expect(rct1).toBe('RCT-001');
      expect(rct2).toBe('RCT-002');
    });

    it('should fetch only unpaid & partially paid invoices for settlement', async () => {
      const res = await request(app)
        .get(`/api/v1/receipts/unpaid-invoices?clientId=${clientId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);

      const returnedIds = res.body.data.map((inv: any) => inv._id);
      expect(returnedIds).toContain(unpaidInvoiceId);
      expect(returnedIds).toContain(partiallyPaidInvoiceId);
      expect(returnedIds).not.toContain(paidInvoiceId);
      expect(returnedIds).not.toContain(draftInvoiceId);
    });
  });

  // ─── Phase 45: Receipt Creation with ACID Transactions ─────────
  describe('Phase 45: Receipt Creation API (MongoDB Transactions)', () => {
    it('should settle invoices atomically and update invoice balances', async () => {
      const payload = {
        clientId,
        date: '2026-10-18',
        paymentMode: 'Bank Transfer',
        referenceNumber: 'UTR987654321',
        totalAmount: 1500,
        settlements: [
          {
            invoiceId: unpaidInvoiceId,
            settledAmount: 1000 // full settlement (due 1000)
          },
          {
            invoiceId: partiallyPaidInvoiceId,
            settledAmount: 500 // partial settlement (due 1500 -> 1000)
          }
        ]
      };

      const res = await request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.receiptNo).toBe('RCT-003');
      expect(res.body.data.totalAmount).toBe(1500);

      // Verify Invoice 1 became Paid
      const inv1After = await Invoice.findById(unpaidInvoiceId);
      expect(inv1After?.status).toBe('Paid');
      expect(inv1After?.totals.amountPaid).toBe(1000);
      expect(inv1After?.totals.amountDue).toBe(0);

      // Verify Invoice 2 is still Partially Paid with reduced balance
      const inv2After = await Invoice.findById(partiallyPaidInvoiceId);
      expect(inv2After?.status).toBe('Partially Paid');
      expect(inv2After?.totals.amountPaid).toBe(1000);
      expect(inv2After?.totals.amountDue).toBe(1000);
    });

    it('should roll back completely on settlement error (ACID rollback)', async () => {
      // Invoice 2 now has amountDue: 1000. Try to settle 5000 (exceeds balance).
      const invalidPayload = {
        clientId,
        date: '2026-10-19',
        totalAmount: 5000,
        settlements: [
          {
            invoiceId: partiallyPaidInvoiceId,
            settledAmount: 5000 // invalid overpayment
          }
        ]
      };

      const res = await request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidPayload);

      expect(res.status).toBe(400);

      // Verify invoice 2 was untouched (Rollback verification)
      const inv2AfterFailed = await Invoice.findById(partiallyPaidInvoiceId);
      expect(inv2AfterFailed?.totals.amountDue).toBe(1000);
      expect(inv2AfterFailed?.totals.amountPaid).toBe(1000);

      // Verify no receipt was saved
      const receiptCount = await Receipt.countDocuments({
        tenantId: orgId,
        referenceNumber: 'INVALID'
      });
      expect(receiptCount).toBe(0);
    });

    it('should list receipts with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/receipts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.receipts.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Phase 46: Auto-Settle Algorithm API ───────────────────────
  describe('Phase 46: Auto-Settle Algorithm API', () => {
    let autoInv1Id: string;
    let autoInv2Id: string;

    beforeAll(async () => {
      // Create 2 test invoices for auto-settle: $100 (oldest) and $200 (newer)
      const aInv1 = new Invoice({
        tenantId: orgId,
        clientId,
        invoiceNo: 'INV-AUTO-100',
        date: new Date('2026-10-01'),
        status: 'Unpaid',
        items: [{ referenceType: 'Manual', particulars: 'A1', quantity: 1, rate: 100, taxableAmount: 100, gstPercentage: 0, gstAmount: 0, total: 100 }],
        totals: { subtotal: 100, totalDiscount: 0, totalTaxable: 100, totalGst: 0, roundOff: 0, grandTotal: 100, amountPaid: 0, amountDue: 100 }
      });
      const saved1 = await aInv1.save();
      autoInv1Id = saved1._id.toString();

      const aInv2 = new Invoice({
        tenantId: orgId,
        clientId,
        invoiceNo: 'INV-AUTO-200',
        date: new Date('2026-10-05'),
        status: 'Unpaid',
        items: [{ referenceType: 'Manual', particulars: 'A2', quantity: 1, rate: 200, taxableAmount: 200, gstPercentage: 0, gstAmount: 0, total: 200 }],
        totals: { subtotal: 200, totalDiscount: 0, totalTaxable: 200, totalGst: 0, roundOff: 0, grandTotal: 200, amountPaid: 0, amountDue: 200 }
      });
      const saved2 = await aInv2.save();
      autoInv2Id = saved2._id.toString();
    });

    it('should preview auto-settle FIFO allocation correctly ($150 over $100 and $200 invoices)', async () => {
      const res = await request(app)
        .post('/api/v1/receipts/auto-settle-preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ clientId, totalAmount: 150 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const allocations = res.body.data.allocations;
      // Older invoice (INV-AUTO-100) should be settled in full (100)
      const a1 = allocations.find((a: any) => a.invoiceNo === 'INV-AUTO-100');
      expect(a1).toBeDefined();
      expect(a1.settledAmount).toBe(100);
      expect(a1.newStatus).toBe('Paid');
    });

    it('should execute receipt creation with autoSettle: true flag', async () => {
      const res = await request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientId,
          date: '2026-10-20',
          totalAmount: 100,
          paymentMode: 'UPI',
          autoSettle: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify older invoice is settled
      const inv1 = await Invoice.findById(autoInv1Id);
      expect(inv1?.status).toBe('Paid');
      expect(inv1?.totals.amountDue).toBe(0);
    });
  });

  // ─── Phase 47: Client Ledger Calculation API ───────────────────
  describe('Phase 47: Ledger Calculation API (GET /ledger/:clientId)', () => {
    it('should merge invoices & receipts chronologically and calculate running balance', async () => {
      const res = await request(app)
        .get(`/api/v1/ledger/${clientId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.client.name).toBe('Financial Client Ltd');
      expect(data.openingBalance).toBe(500); // client initial opening balance
      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.entries.length).toBeGreaterThanOrEqual(4);

      // Verify every entry has a calculated balance
      let currentBal = data.openingBalance;
      for (const entry of data.entries) {
        expect(entry).toHaveProperty('balance');
        currentBal += entry.debit - entry.credit;
        expect(entry.balance).toBe(Math.round(currentBal * 100) / 100);
      }

      expect(data.closingBalance).toBe(Math.round(currentBal * 100) / 100);
    });

    it('should calculate rolling opening balance when date filter is used', async () => {
      const res = await request(app)
        .get(`/api/v1/ledger/${clientId}?from=2026-10-06`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // All entries prior to Oct 6 are rolled into openingBalance
      expect(res.body.data).toHaveProperty('openingBalance');
      for (const entry of res.body.data.entries) {
        expect(new Date(entry.date).getTime()).toBeGreaterThanOrEqual(
          new Date('2026-10-06').getTime()
        );
      }
    });
  });

  // ─── Phase 48: Dashboard Overview Widget Data API ──────────────
  describe('Phase 48: Dashboard Widget Data API (GET /dashboard/overview)', () => {
    it('should return aggregated practice metrics matching database records', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const stats = res.body.data.quickStats;
      expect(stats.totalClients).toBeGreaterThanOrEqual(1);
      expect(typeof stats.pendingTasks).toBe('number');
      expect(typeof stats.overdueInvoices).toBe('number');
      expect(stats.totalReceivables).toBeGreaterThan(0);

      const activity = res.body.data.recentActivity;
      expect(Array.isArray(activity.invoices)).toBe(true);
      expect(Array.isArray(activity.receipts)).toBe(true);
    });

    it('should return client facet summary via GET /dashboard/clients/:id/summary', async () => {
      const res = await request(app)
        .get(`/api/v1/dashboard/clients/${clientId}/summary`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.client.name).toBe('Financial Client Ltd');
      expect(data.financials).toHaveProperty('currentLedgerBalance');
      expect(data.tasks).toHaveProperty('pending');
      expect(data.tasks).toHaveProperty('unbilledCount');
    });
  });
});
