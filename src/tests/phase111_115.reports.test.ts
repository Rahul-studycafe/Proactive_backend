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
import { DSC } from '../models/DSC';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
import dotenv from 'dotenv';

dotenv.config();
jest.setTimeout(30000);

describe('Part 23: Business Intelligence, Reporting & Streaming Excel Exports (Phases 111–115)', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let userAId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;
  let clientAId: string;
  let serviceAId: string;

  const orgASlug = 'report-orga-p23';
  const orgBSlug = 'report-orgb-p23';
  const userAEmail = 'adminA.report23@example.com';
  const userBEmail = 'adminB.report23@example.com';

  beforeAll(async () => {
    await connectDB();

    // Clean up stale test data
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });
    await Task.deleteMany({}).setOptions({ skipTenantPlugin: true });
    await DSC.deleteMany({}).setOptions({ skipTenantPlugin: true });
    await Invoice.deleteMany({}).setOptions({ skipTenantPlugin: true });
    await Receipt.deleteMany({}).setOptions({ skipTenantPlugin: true });
    await Service.deleteMany({}).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({
      name: 'Delta Audit & Analytics LLC',
      slug: orgASlug,
      address: {
        addressLine1: '88 Marine Drive',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        pincode: '400020'
      },
      gstin: '27AAAAA1234A1Z5',
      pan: 'AAAAA1234A'
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
      name: 'Partner Analytics A',
      username: 'partner_a_p23',
      email: userAEmail,
      password: 'password123',
      roleId: roleA._id
    });
    userAId = userA._id as mongoose.Types.ObjectId;

    // Setup Org B (for multi-tenant isolation testing)
    const orgB = await Organization.create({
      name: 'Epsilon Tech Accounting',
      slug: orgBSlug,
      address: {
        addressLine1: '99 MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        pincode: '560001'
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
      name: 'Partner Analytics B',
      username: 'partner_b_p23',
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

    // Create a Service in Org A
    const serviceA = await Service.create({
      tenantId: orgAId,
      name: 'Statutory GST Audit',
      isEnabled: true,
      isRecurring: true,
      frequency: { type: 'monthly' },
      sacCode: '998231',
      gstPercentage: 18,
      defaultBillingRate: 15000,
      checklist: [{ stepName: 'Collect GSTR 2B', orderIndex: 1 }]
    });
    serviceAId = serviceA._id.toString();

    // Create a Client in Org A with subscribed service
    const clientA = await Client.create({
      tenantId: orgAId,
      name: 'Apex Infotech Ltd',
      pan: 'ABCDE1234F',
      gstin: '27ABCDE1234F1Z5',
      state: 'Maharashtra',
      mobile: '9876543210',
      isActive: true,
      subscribedServices: [
        {
          serviceId: serviceA._id as mongoose.Types.ObjectId,
          customPrice: 18000,
          customUsers: [],
          subscribedAt: new Date()
        }
      ]
    });
    clientAId = clientA._id.toString();

    // Seed Operational Data: Tasks
    const pastDueDate = new Date();
    pastDueDate.setDate(pastDueDate.getDate() - 10);

    const futureDueDate = new Date();
    futureDueDate.setDate(futureDueDate.getDate() + 15);

    await Task.create([
      {
        tenantId: orgAId,
        clientId: clientA._id,
        serviceId: serviceA._id,
        assigneeIds: [userAId],
        description: 'Monthly GSTR-1 Review',
        status: 'Completed',
        priority: 'High',
        dueDate: pastDueDate,
        billingAmount: 5000,
        timeLogged: 120
      },
      {
        tenantId: orgAId,
        clientId: clientA._id,
        serviceId: serviceA._id,
        assigneeIds: [userAId],
        description: 'Reconcile Purchase Register',
        status: 'In Progress',
        priority: 'Urgent',
        dueDate: pastDueDate, // Overdue!
        billingAmount: 7000,
        timeLogged: 90
      },
      {
        tenantId: orgAId,
        clientId: clientA._id,
        serviceId: serviceA._id,
        assigneeIds: [userAId],
        description: 'Quarterly Advance Tax',
        status: 'Pending',
        priority: 'Medium',
        dueDate: futureDueDate,
        billingAmount: 6000,
        timeLogged: 0
      }
    ]);

    // Seed DSC Data
    const exp15 = new Date();
    exp15.setDate(exp15.getDate() + 15);
    const exp45 = new Date();
    exp45.setDate(exp45.getDate() + 45);
    const exp120 = new Date();
    exp120.setDate(exp120.getDate() + 120);
    const expPassed = new Date();
    expPassed.setDate(expPassed.getDate() - 5);

    await DSC.create([
      {
        tenantId: orgAId,
        clientId: clientA._id,
        certificateName: 'Director DSC 1',
        certificateClass: 'Class 3',
        tokenType: 'ePass2003',
        tokenSerialNumber: 'EP2003-991',
        issuingAuthority: 'eMudhra',
        issueDate: new Date('2024-01-01'),
        expiryDate: exp15,
        physicalLocation: 'Safe Cabinet 1',
        status: 'In Office',
        createdBy: userAId
      },
      {
        tenantId: orgAId,
        clientId: clientA._id,
        certificateName: 'Director DSC 2',
        certificateClass: 'Class 3',
        tokenType: 'ProxKey',
        tokenSerialNumber: 'PX-8821',
        issuingAuthority: 'Capricorn',
        issueDate: new Date('2024-01-01'),
        expiryDate: exp45,
        physicalLocation: 'Safe Cabinet 2',
        status: 'In Office',
        createdBy: userAId
      },
      {
        tenantId: orgAId,
        clientId: clientA._id,
        certificateName: 'CFO DSC 3',
        certificateClass: 'Class 3',
        tokenType: 'mToken',
        tokenSerialNumber: 'MT-1102',
        issuingAuthority: 'Vsign',
        issueDate: new Date('2024-01-01'),
        expiryDate: exp120,
        physicalLocation: 'With Client',
        status: 'With Client',
        currentHolderName: 'Apex CFO Office',
        createdBy: userAId
      },
      {
        tenantId: orgAId,
        clientId: clientA._id,
        certificateName: 'Expired Token',
        certificateClass: 'Class 2',
        tokenType: 'Other',
        tokenSerialNumber: 'EX-0000',
        issuingAuthority: 'Other',
        issueDate: new Date('2023-01-01'),
        expiryDate: expPassed,
        physicalLocation: 'Archive Bin',
        status: 'Expired',
        createdBy: userAId
      }
    ]);

    // Seed Financial Data: Invoices with Aging
    const due10DaysAgo = new Date();
    due10DaysAgo.setDate(due10DaysAgo.getDate() - 10);

    const due40DaysAgo = new Date();
    due40DaysAgo.setDate(due40DaysAgo.getDate() - 40);

    const due75DaysAgo = new Date();
    due75DaysAgo.setDate(due75DaysAgo.getDate() - 75);

    const due105DaysAgo = new Date();
    due105DaysAgo.setDate(due105DaysAgo.getDate() - 105);

    await Invoice.create([
      {
        tenantId: orgAId,
        clientId: clientA._id,
        invoiceNo: 'INV-2026-001',
        date: due10DaysAgo,
        dueDate: due10DaysAgo,
        status: 'Unpaid',
        items: [
          {
            referenceType: 'Manual',
            particulars: 'Audit Services Fee',
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
      },
      {
        tenantId: orgAId,
        clientId: clientA._id,
        invoiceNo: 'INV-2026-002',
        date: due40DaysAgo,
        dueDate: due40DaysAgo,
        status: 'Partially Paid',
        items: [
          {
            referenceType: 'Manual',
            particulars: 'Tax Filing Consultancy',
            sacCode: '998231',
            quantity: 1,
            rate: 30000,
            discount: 0,
            taxableAmount: 30000,
            gstPercentage: 18,
            gstAmount: 5400,
            total: 35400
          }
        ],
        totals: {
          subtotal: 30000,
          totalDiscount: 0,
          totalTaxable: 30000,
          totalGst: 5400,
          roundOff: 0,
          grandTotal: 35400,
          amountPaid: 15400,
          amountDue: 20000 // Overdue 40 days (31-60 bucket)
        }
      },
      {
        tenantId: orgAId,
        clientId: clientA._id,
        invoiceNo: 'INV-2026-003',
        date: due75DaysAgo,
        dueDate: due75DaysAgo,
        status: 'Unpaid',
        items: [
          {
            referenceType: 'Manual',
            particulars: 'Corporate Restructuring Advisory',
            sacCode: '998231',
            quantity: 1,
            rate: 50000,
            discount: 0,
            taxableAmount: 50000,
            gstPercentage: 18,
            gstAmount: 9000,
            total: 59000
          }
        ],
        totals: {
          subtotal: 50000,
          totalDiscount: 0,
          totalTaxable: 50000,
          totalGst: 9000,
          roundOff: 0,
          grandTotal: 59000,
          amountPaid: 0,
          amountDue: 59000 // Critical 75 days (61-90 bucket)
        }
      },
      {
        tenantId: orgAId,
        clientId: clientA._id,
        invoiceNo: 'INV-2026-004',
        date: due105DaysAgo,
        dueDate: due105DaysAgo,
        status: 'Unpaid',
        items: [
          {
            referenceType: 'Manual',
            particulars: 'Forensic Audit Report',
            sacCode: '998231',
            quantity: 1,
            rate: 40000,
            discount: 0,
            taxableAmount: 40000,
            gstPercentage: 18,
            gstAmount: 7200,
            total: 47200
          }
        ],
        totals: {
          subtotal: 40000,
          totalDiscount: 0,
          totalTaxable: 40000,
          totalGst: 7200,
          roundOff: 0,
          grandTotal: 47200,
          amountPaid: 0,
          amountDue: 47200 // Delinquent 105 days (90+ bucket)
        }
      }
    ]);

    // Seed Receipts
    await Receipt.create([
      {
        tenantId: orgAId,
        clientId: clientA._id,
        receiptNo: 'REC-2026-001',
        date: new Date(),
        paymentMode: 'Bank Transfer',
        referenceNumber: 'NEFT-889911',
        totalAmount: 15400,
        tdsAmount: 500,
        discountAmount: 0,
        settlements: []
      },
      {
        tenantId: orgAId,
        clientId: clientA._id,
        receiptNo: 'REC-2026-002',
        date: new Date(),
        paymentMode: 'UPI',
        referenceNumber: 'UPI-992200',
        totalAmount: 10000,
        tdsAmount: 0,
        discountAmount: 0,
        settlements: []
      }
    ]);
  });

  afterAll(async () => {
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });
    await Task.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await DSC.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Invoice.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Receipt.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Service.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Client.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
  });

  // ─── Phase 112 Tests: Operational Reports ──────────────────────

  describe('Phase 112: Operational & Task Reporting Endpoints', () => {
    it('GET /api/v1/reports/tasks returns aggregated task velocity and metrics', async () => {
      const res = await request(app)
        .get('/api/v1/reports/tasks')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.summary.totalTasks).toBe(3);
      expect(res.body.data.summary.completedTasks).toBe(1);
      expect(res.body.data.summary.overdueTasks).toBe(1);
      expect(res.body.data.summary.totalTimeLogged).toBe(210);
      expect(res.body.data.summary.completionVelocity).toBe(33); // 1 out of 3 = 33%
      expect(res.body.data.pagination.total).toBe(3);
      expect(res.body.data.data.length).toBe(3);
    });

    it('GET /api/v1/reports/tasks filterable by status', async () => {
      const res = await request(app)
        .get('/api/v1/reports/tasks?status=Completed')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary.totalTasks).toBe(1);
      expect(res.body.data.data[0].status).toBe('Completed');
    });

    it('GET /api/v1/reports/services returns active subscriptions and recurring yield', async () => {
      const res = await request(app)
        .get('/api/v1/reports/services')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.totalServicesOffered).toBe(1);
      expect(res.body.data.summary.totalActiveSubscriptions).toBe(1);
      expect(res.body.data.summary.totalMonthlyRecurringRevenue).toBe(18000);
      expect(res.body.data.data[0].serviceName).toBe('Statutory GST Audit');
      expect(res.body.data.data[0].clientCount).toBe(1);
    });

    it('GET /api/v1/reports/dsc-renewals computes 30/60/90/180/expired buckets', async () => {
      const res = await request(app)
        .get('/api/v1/reports/dsc-renewals')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const summary = res.body.data.summary;
      expect(summary.totalTokens).toBe(4);
      expect(summary.expiringIn30Days).toBe(1);
      expect(summary.expiringIn60Days).toBe(1);
      expect(summary.expiringIn180Days).toBe(1);
      expect(summary.expired).toBe(1);
      expect(res.body.data.data.length).toBe(4);
    });
  });

  // ─── Phase 113 Tests: Financial Reports ────────────────────────

  describe('Phase 113: Financial & Revenue Reporting Endpoints', () => {
    it('GET /api/v1/reports/invoices returns deep financial revenue breakdown', async () => {
      const res = await request(app)
        .get('/api/v1/reports/invoices')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const summary = res.body.data.summary;
      expect(summary.invoiceCount).toBe(4);
      expect(summary.totalInvoiced).toBe(23600 + 35400 + 59000 + 47200);
      expect(summary.totalTaxable).toBe(20000 + 30000 + 50000 + 40000);
      expect(summary.totalTax).toBe(3600 + 5400 + 9000 + 7200);
      expect(summary.totalPaid).toBe(15400);
      expect(summary.totalDue).toBe(23600 + 20000 + 59000 + 47200);
      expect(res.body.data.data.length).toBe(4);
    });

    it('GET /api/v1/reports/receipts returns cash flow breakdown by payment mode', async () => {
      const res = await request(app)
        .get('/api/v1/reports/receipts')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const summary = res.body.data.summary;
      expect(summary.totalReceipts).toBe(2);
      expect(summary.totalCollected).toBe(25400);
      expect(summary.totalTds).toBe(500);
      expect(summary.byPaymentMode['Bank Transfer']).toBe(15400);
      expect(summary.byPaymentMode['UPI']).toBe(10000);
    });

    it('GET /api/v1/reports/gst-summary returns GSTR-1 itemized B2B line items and tax breakdown', async () => {
      const res = await request(app)
        .get('/api/v1/reports/gst-summary')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const summary = res.body.data.summary;
      expect(summary.b2bCount).toBe(4);
      expect(summary.totalTaxableValue).toBe(140000);
      expect(summary.totalGstAmount).toBe(25200);
      expect(summary.totalCgst).toBe(12600);
      expect(summary.totalSgst).toBe(12600);
      expect(res.body.data.data[0].clientGstin).toBe('27ABCDE1234F1Z5');
      expect(res.body.data.data[0].sacCode).toBe('998231');
    });
  });

  // ─── Phase 114 Tests: Debtors Aging Outstandings ────────────────

  describe('Phase 114: Debtors Aging Outstandings Report', () => {
    it('GET /api/v1/reports/debtors-aging groups balances into 0-30, 31-60, 61-90, 90+ buckets', async () => {
      const res = await request(app)
        .get('/api/v1/reports/debtors-aging')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const summary = res.body.data.summary;
      expect(summary.totalDebtorsCount).toBe(1);
      expect(summary.totalCurrent0_30).toBe(23600);
      expect(summary.totalOverdue31_60).toBe(20000);
      expect(summary.totalCritical61_90).toBe(59000);
      expect(summary.totalDelinquent90Plus).toBe(47200);
      expect(summary.totalOutstanding).toBe(23600 + 20000 + 59000 + 47200);

      const clientAging = res.body.data.data[0];
      expect(clientAging.clientName).toBe('Apex Infotech Ltd');
      expect(clientAging.pan).toBe('ABCDE1234F');
      expect(clientAging.bucket0_30).toBe(23600);
      expect(clientAging.bucket31_60).toBe(20000);
      expect(clientAging.bucket61_90).toBe(59000);
      expect(clientAging.bucket90Plus).toBe(47200);
      expect(clientAging.invoicesCount).toBe(4);
    });
  });

  // ─── Phase 115 Tests: High-Performance Streaming Excel Export ──

  describe('Phase 115: High-Performance Streaming Excel Export Engine (exceljs)', () => {
    it('GET /api/v1/reports/tasks/export streams XLSX workbook with correct headers', async () => {
      const res = await request(app)
        .get('/api/v1/reports/tasks/export')
        .set('Authorization', `Bearer ${tokenA}`)
        .buffer(true)
        .parse((res, callback) => {
          res.setEncoding('binary');
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            callback(null, Buffer.from(data, 'binary'));
          });
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('attachment; filename="tasks_export_');
      expect(res.body.length).toBeGreaterThan(100); // Valid zip/xlsx binary bytes
    });

    it('GET /api/v1/reports/invoices/export streams XLSX workbook with financial rows', async () => {
      const res = await request(app)
        .get('/api/v1/reports/invoices/export')
        .set('Authorization', `Bearer ${tokenA}`)
        .buffer(true)
        .parse((res, callback) => {
          res.setEncoding('binary');
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            callback(null, Buffer.from(data, 'binary'));
          });
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('attachment; filename="invoices_export_');
      expect(res.body.length).toBeGreaterThan(100);
    });

    it('GET /api/v1/reports/debtors-aging/export streams aging report workbook', async () => {
      const res = await request(app)
        .get('/api/v1/reports/debtors-aging/export')
        .set('Authorization', `Bearer ${tokenA}`)
        .buffer(true)
        .parse((res, callback) => {
          res.setEncoding('binary');
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            callback(null, Buffer.from(data, 'binary'));
          });
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('attachment; filename="debtors-aging_export_');
      expect(res.body.length).toBeGreaterThan(100);
    });

    it('GET /api/v1/reports/services/export streams service subscriptions workbook', async () => {
      const res = await request(app)
        .get('/api/v1/reports/services/export')
        .set('Authorization', `Bearer ${tokenA}`)
        .buffer(true)
        .parse((res, callback) => {
          res.setEncoding('binary');
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            callback(null, Buffer.from(data, 'binary'));
          });
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.body.length).toBeGreaterThan(100);
    });

    it('GET /api/v1/reports/invalid-type/export rejects with 400 and validation error', async () => {
      const res = await request(app)
        .get('/api/v1/reports/unsupported-type/export')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REPORT_TYPE');
    });
  });

  // ─── Multi-Tenant Isolation ─────────────────────────────────────

  describe('Multi-Tenant Isolation', () => {
    it('Org B cannot view Org A tasks, invoices, or aging data', async () => {
      const taskRes = await request(app)
        .get('/api/v1/reports/tasks')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(taskRes.status).toBe(200);
      expect(taskRes.body.data.summary.totalTasks).toBe(0);
      expect(taskRes.body.data.data.length).toBe(0);

      const invoiceRes = await request(app)
        .get('/api/v1/reports/invoices')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(invoiceRes.status).toBe(200);
      expect(invoiceRes.body.data.summary.invoiceCount).toBe(0);

      const agingRes = await request(app)
        .get('/api/v1/reports/debtors-aging')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(agingRes.status).toBe(200);
      expect(agingRes.body.data.summary.totalDebtorsCount).toBe(0);
    });
  });
});
