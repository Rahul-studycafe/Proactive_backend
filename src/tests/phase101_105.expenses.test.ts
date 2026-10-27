import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import app from '../app';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { ExpenseCategory } from '../modules/masters/schemas/expense-category.schema';
import { Expense } from '../models/Expense';
import { Invoice } from '../models/Invoice';
import dotenv from 'dotenv';

dotenv.config();
jest.setTimeout(30000);

describe('Part 21: Client Reimbursable Expenses & Invoicing Bridge (Phases 101–105)', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;
  let clientAId: string;
  let clientBId: string;
  let categoryAId: string;
  let userAId: string;
  let dummyReceiptPath: string;

  const orgASlug = 'expense-orga-p21';
  const orgBSlug = 'expense-orgb-p21';
  const userAEmail = 'adminA.expense21@example.com';
  const userBEmail = 'adminB.expense21@example.com';

  beforeAll(async () => {
    await connectDB();

    // Clean up past records
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });
    await Expense.deleteMany({}).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({ name: 'Expense Audit Firm A', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Super Admin A',
      isSuperAdmin: true,
      permissions: {}
    });

    const userA = await User.create({
      tenantId: orgAId,
      name: 'Admin User A',
      username: 'admin_a_expense21',
      email: userAEmail,
      password: 'password123',
      roleId: roleA._id
    });
    userAId = (userA._id as mongoose.Types.ObjectId).toString();

    // Setup Org B (for multi-tenant isolation verification)
    const orgB = await Organization.create({ name: 'Expense Audit Firm B', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Super Admin B',
      isSuperAdmin: true,
      permissions: {}
    });

    await User.create({
      tenantId: orgBId,
      name: 'Admin User B',
      username: 'admin_b_expense21',
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

    // Create Clients
    const clientA = await Client.create({
      tenantId: orgAId,
      name: 'Acme Technologies Ltd',
      fileNo: 'EXP-CLI-001',
      pan: 'ABCDE1234F',
      email: 'finance@acme.com',
      mobile: '9876543210',
      contactPersonName: 'John Doe'
    });
    clientAId = (clientA._id as mongoose.Types.ObjectId).toString();

    const clientB = await Client.create({
      tenantId: orgBId,
      name: 'Beta Global Inc',
      fileNo: 'EXP-CLI-002',
      pan: 'XYZAB5678C',
      email: 'accounts@betaglobal.com',
      mobile: '9876543211',
      contactPersonName: 'Jane Smith'
    });
    clientBId = (clientB._id as mongoose.Types.ObjectId).toString();

    // Create Category in Org A
    const categoryA = await ExpenseCategory.create({
      tenantId: orgAId,
      name: 'ROC Filing & Stamp Duty',
      isActive: true
    });
    categoryAId = (categoryA._id as mongoose.Types.ObjectId).toString();

    // Create dummy receipt file for upload tests
    dummyReceiptPath = path.join(__dirname, 'dummy_receipt.pdf');
    fs.writeFileSync(dummyReceiptPath, '%PDF-1.4 dummy voucher receipt content');
  });

  afterAll(async () => {
    // Clean up dummy receipt file
    if (fs.existsSync(dummyReceiptPath)) {
      try {
        fs.unlinkSync(dummyReceiptPath);
      } catch (_) {}
    }

    // Clean up created records
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });
    await Client.deleteMany({ _id: { $in: [clientAId, clientBId] } }).setOptions({ skipTenantPlugin: true });
    await Expense.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await Invoice.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
  });

  let createdExpense1Id: string;
  let createdExpense2Id: string;

  describe('Phase 101 & 102: Expense Creation, Auto-Sequence & Ledger Filter', () => {
    it('should create an expense with auto-generated sequence EXP-001 and isBilled: false', async () => {
      const res = await request(app)
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${tokenA}`)
        .field('clientId', clientAId)
        .field('categoryId', categoryAId)
        .field('amount', 2500)
        .field('paymentMode', 'Bank Transfer')
        .field('paidFromAccount', 'HDFC Current A/C')
        .field('notes', 'Form AOC-4 Annual ROC Filing Govt Challan')
        .attach('receipt', dummyReceiptPath);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.expenseNo).toBe('EXP-001');
      expect(res.body.data.amount).toBe(2500);
      expect(res.body.data.isBilled).toBe(false);
      expect(res.body.data.categoryName).toBe('ROC Filing & Stamp Duty');
      expect(res.body.data.receiptFileUrl).toBeDefined();
      expect(res.body.data.receiptFileUrl).toContain('/uploads/expenses/');

      createdExpense1Id = res.body.data._id;
    });

    it('should create a second expense incrementing sequence to EXP-002', async () => {
      const res = await request(app)
        .post('/api/v1/expenses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          categoryId: categoryAId,
          amount: 1500,
          paymentMode: 'UPI',
          paidFromAccount: 'ICICI Practice A/C',
          notes: 'GST Portal Stamping Fee'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.expenseNo).toBe('EXP-002');
      expect(res.body.data.amount).toBe(1500);
      expect(res.body.data.isBilled).toBe(false);

      createdExpense2Id = res.body.data._id;
    });

    it('should list expenses with financial summary totals (totalAmount, billedAmount, unbilledAmount)', async () => {
      const res = await request(app)
        .get('/api/v1/expenses')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ clientId: clientAId, isBilled: 'false' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.expenses.length).toBe(2);
      expect(res.body.data.summary.totalAmount).toBe(4000);
      expect(res.body.data.summary.billedAmount).toBe(0);
      expect(res.body.data.summary.unbilledAmount).toBe(4000);
    });

    it('should retrieve single expense details by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/expenses/${createdExpense1Id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(createdExpense1Id);
      expect(res.body.data.clientId.name).toBe('Acme Technologies Ltd');
      expect(res.body.data.categoryId.name).toBe('ROC Filing & Stamp Duty');
    });

    it('should update an unbilled expense', async () => {
      const res = await request(app)
        .put(`/api/v1/expenses/${createdExpense2Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          amount: 1750,
          notes: 'Updated Stamping & Notary Fee'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.amount).toBe(1750);
      expect(res.body.data.notes).toBe('Updated Stamping & Notary Fee');
    });
  });

  describe('Phase 103: Unbilled Expenses Aggregation for Invoicing Workspace', () => {
    it('should aggregate unbilled expenses with formatted particulars for client invoicing', async () => {
      const res = await request(app)
        .get(`/api/v1/billing/unbilled-expenses/${clientAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.unbilledExpenses.length).toBe(2);
      expect(res.body.data.totalUnbilledExpensesAmount).toBe(4250); // 2500 + 1750

      const firstItem = res.body.data.unbilledExpenses[0];
      expect(firstItem.referenceType).toBe('Expense');
      expect(firstItem.referenceId).toBe(createdExpense1Id);
      expect(firstItem.particulars).toContain('[ROC Filing & Stamp Duty]');
      expect(firstItem.particulars).toContain('Form AOC-4 Annual ROC Filing Govt Challan');
    });

    it('should also be accessible via invoice routes alias /api/v1/invoices/unbilled-expenses/:clientId', async () => {
      const res = await request(app)
        .get(`/api/v1/invoices/unbilled-expenses/${clientAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.unbilledExpenses.length).toBe(2);
    });
  });

  let createdInvoiceId: string;

  describe('Phase 104: Atomic Invoice Ingestion & Auto-Marking', () => {
    it('should create an invoice incorporating expense line item and auto-mark expense as isBilled: true', async () => {
      const invoicePayload = {
        clientId: clientAId,
        date: new Date().toISOString(),
        items: [
          {
            referenceType: 'Expense',
            referenceId: createdExpense1Id,
            particulars: '[ROC Filing & Stamp Duty] Form AOC-4 Annual ROC Filing Govt Challan',
            rate: 2500,
            quantity: 1,
            discount: 0,
            gstPercentage: 0
          },
          {
            referenceType: 'Manual',
            particulars: 'Professional Consultation Services',
            rate: 10000,
            quantity: 1,
            discount: 0,
            gstPercentage: 18
          }
        ],
        status: 'Unpaid'
      };

      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(invoicePayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.invoiceNo).toBeDefined();

      createdInvoiceId = res.body.data._id;

      // Verify expense 1 is now marked as isBilled: true and linked to invoiceId
      const checkExpense = await Expense.findById(createdExpense1Id);
      expect(checkExpense?.isBilled).toBe(true);
      expect(checkExpense?.invoiceId?.toString()).toBe(createdInvoiceId);
      expect(checkExpense?.billedAt).toBeDefined();
    });

    it('should reject creating an invoice referencing an already-billed expense with HTTP 409', async () => {
      const duplicateBillPayload = {
        clientId: clientAId,
        date: new Date().toISOString(),
        items: [
          {
            referenceType: 'Expense',
            referenceId: createdExpense1Id, // Already billed!
            particulars: 'Duplicate billing attempt',
            rate: 2500,
            quantity: 1,
            gstPercentage: 0
          }
        ],
        status: 'Unpaid'
      };

      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(duplicateBillPayload);

      expect(res.status).toBe(409);
      expect(res.body.error?.message || res.body.message).toContain('already been billed');
    });

    it('should reject editing or deleting an expense once it is marked as isBilled: true', async () => {
      // Attempt to edit billed expense
      const editRes = await request(app)
        .put(`/api/v1/expenses/${createdExpense1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 9999 });

      expect(editRes.status).toBe(400);
      expect(editRes.body.error?.message || editRes.body.message).toContain('Cannot edit an expense that has already been billed');

      // Attempt to delete billed expense
      const deleteRes = await request(app)
        .delete(`/api/v1/expenses/${createdExpense1Id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(deleteRes.status).toBe(400);
      expect(deleteRes.body.error?.message || deleteRes.body.message).toContain('Cannot delete an expense that has already been billed');
    });
  });

  describe('Phase 105: Invoice Cancellation Reversion & Practice Outlay Analytics', () => {
    it('should revert billed expense back to isBilled: false when the invoice is cancelled', async () => {
      // Cancel the invoice
      const cancelRes = await request(app)
        .delete(`/api/v1/invoices/${createdInvoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('Cancelled');

      // Verify expense 1 was automatically un-billed
      const revertedExpense = await Expense.findById(createdExpense1Id);
      expect(revertedExpense?.isBilled).toBe(false);
      expect(revertedExpense?.invoiceId).toBeUndefined();
      expect(revertedExpense?.billedAt).toBeNull();
    });

    it('should compute practice expense analytics including recovery rate % and category breakdown', async () => {
      // Re-bill expense 2 on a new invoice to have mixed billed/unbilled data
      const reBillRes = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          date: new Date().toISOString(),
          items: [
            {
              referenceType: 'Expense',
              referenceId: createdExpense2Id,
              particulars: '[ROC Filing & Stamp Duty] Stamping Fee',
              rate: 1750,
              quantity: 1,
              gstPercentage: 0
            }
          ],
          status: 'Unpaid'
        });

      expect(reBillRes.status).toBe(201);

      // Query analytics
      const analyticsRes = await request(app)
        .get('/api/v1/analytics/expenses')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(analyticsRes.status).toBe(200);
      expect(analyticsRes.body.success).toBe(true);
      expect(analyticsRes.body.data.overview.totalExpenseAmount).toBe(4250); // 2500 + 1750
      expect(analyticsRes.body.data.overview.billedExpenseAmount).toBe(1750);
      expect(analyticsRes.body.data.overview.unbilledExpenseAmount).toBe(2500);
      expect(analyticsRes.body.data.overview.recoveryRatePercentage).toBe(41); // 1750 / 4250 = 41.17%
      expect(analyticsRes.body.data.byCategory.length).toBeGreaterThanOrEqual(1);
      expect(analyticsRes.body.data.monthlyTrends.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Multi-Tenant Security Isolation', () => {
    it('should prevent Tenant B from accessing or mutating Tenant A expenses', async () => {
      // Tenant B queries Tenant A expense
      const getRes = await request(app)
        .get(`/api/v1/expenses/${createdExpense1Id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(getRes.status).toBe(404);

      // Tenant B attempts to update Tenant A expense
      const putRes = await request(app)
        .put(`/api/v1/expenses/${createdExpense1Id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ amount: 50 });

      expect(putRes.status).toBe(404);

      // Tenant B unbilled list for Client A should return 404 (client not found in tenant B)
      const unbilledRes = await request(app)
        .get(`/api/v1/billing/unbilled-expenses/${clientAId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(unbilledRes.status).toBe(404);
    });
  });
});
