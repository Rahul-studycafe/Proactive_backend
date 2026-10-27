import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { Invoice } from '../models/Invoice';
import { CreditNote } from '../models/CreditNote';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 16: Financial Adjustments: Credit Notes & Ledger Reconciliation (Phases 76–80)', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;
  let clientAId: string;
  let clientBId: string;
  let invoice1Id: string;
  let invoice2Id: string;
  let invoice3Id: string;
  let creditNote1Id: string;
  let unallocatedCreditNoteId: string;

  const orgASlug = 'cn-orga-p76';
  const orgBSlug = 'cn-orgb-p76';
  const userAEmail = 'adminA.cn76@example.com';
  const userBEmail = 'adminB.cn76@example.com';

  beforeAll(async () => {
    await connectDB();

    // Clean up stale organizations
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({
      name: 'Credit Note Org A',
      slug: orgASlug,
      lastInvoiceNumber: 0,
      lastCreditNoteNumber: 0
    });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    await User.create({
      tenantId: orgAId,
      name: 'Admin A',
      username: 'admin_a_cn76',
      email: userAEmail,
      password: 'password123',
      roleId: roleA._id
    });

    const loginResA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userAEmail, password: 'password123' });
    tokenA = loginResA.body.data.accessToken;

    const clientA = await Client.create({
      tenantId: orgAId,
      name: 'Tata Consultancy Services Test',
      email: 'tata@example.com',
      mobile: '9811223344',
      pan: 'ABCDE5678F',
      gstin: '27ABCDE5678F1Z5',
      entityType: 'Private Limited',
      openingBalance: 1000 // Opening debit balance of 1000
    });
    clientAId = clientA._id.toString();

    // Create Invoice 1 for Client A (₹10,000, Unpaid)
    const inv1 = await Invoice.create({
      tenantId: orgAId,
      clientId: clientA._id,
      invoiceNo: 'INV-1001',
      date: new Date('2026-04-05'),
      dueDate: new Date('2026-04-20'),
      items: [
        {
          referenceType: 'Manual',
          particulars: 'Tax Advisory & Compliance Services',
          quantity: 1,
          rate: 10000,
          discount: 0,
          taxableAmount: 10000,
          gstPercentage: 0,
          gstAmount: 0,
          total: 10000
        }
      ],
      totals: {
        subtotal: 10000,
        totalDiscount: 0,
        totalTaxable: 10000,
        totalGst: 0,
        roundOff: 0,
        grandTotal: 10000,
        amountPaid: 0,
        amountDue: 10000
      },
      status: 'Unpaid',
      creditNoteIds: []
    });
    invoice1Id = inv1._id.toString();

    // Setup Org B for tenant isolation testing
    const orgB = await Organization.create({
      name: 'Credit Note Org B',
      slug: orgBSlug,
      lastInvoiceNumber: 0,
      lastCreditNoteNumber: 0
    });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    await User.create({
      tenantId: orgBId,
      name: 'Admin B',
      username: 'admin_b_cn76',
      email: userBEmail,
      password: 'password123',
      roleId: roleB._id
    });

    const loginResB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userBEmail, password: 'password123' });
    tokenB = loginResB.body.data.accessToken;

    const clientB = await Client.create({
      tenantId: orgBId,
      name: 'Infosys Org B Client',
      email: 'infosys@example.com',
      mobile: '9811223355',
      pan: 'BCDEF6789G',
      gstin: '27BCDEF6789G1Z5',
      entityType: 'Private Limited'
    });
    clientBId = clientB._id.toString();
  });

  afterAll(async () => {
    if (orgAId) {
      await CreditNote.deleteMany({ tenantId: orgAId });
      await Invoice.deleteMany({ tenantId: orgAId });
      await Client.deleteMany({ tenantId: orgAId });
      await User.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
      await Role.deleteMany({ tenantId: orgAId });
      await Organization.deleteOne({ _id: orgAId });
    }
    if (orgBId) {
      await CreditNote.deleteMany({ tenantId: orgBId });
      await Invoice.deleteMany({ tenantId: orgBId });
      await Client.deleteMany({ tenantId: orgBId });
      await User.deleteMany({ tenantId: orgBId }).setOptions({ skipTenantPlugin: true });
      await Role.deleteMany({ tenantId: orgBId });
      await Organization.deleteOne({ _id: orgBId });
    }
    await mongoose.connection.close();
  });

  // ─── Phase 76: Credit Note Schema & Sequence Generator ──────────────
  describe('Phase 76: Credit Note Schema & Atomic Sequence Generator', () => {
    it('issues a credit note with sequential CN number (CN-001) and sets status Applied', async () => {
      const res = await request(app)
        .post('/api/v1/credit-notes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          invoiceId: invoice1Id,
          date: '2026-04-10',
          reason: 'Overcharge Correction',
          items: [
            {
              description: 'Overcharge adjustment on Advisory fee',
              quantity: 1,
              rate: 3000,
              gstPercentage: 0
            }
          ],
          totals: {
            grandTotal: 3000
          },
          notes: 'Agreed 30% correction with client partner'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.creditNoteNo).toBe('CN-001');
      expect(res.body.data.totals.grandTotal).toBe(3000);
      expect(res.body.data.creditAppliedToInvoice).toBe(3000);
      expect(res.body.data.unallocatedCredit).toBe(0);
      expect(res.body.data.status).toBe('Applied');

      creditNote1Id = res.body.data._id;
    });

    it('rejects credit note issuance if grand total is zero or negative', async () => {
      const res = await request(app)
        .post('/api/v1/credit-notes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          invoiceId: invoice1Id,
          date: '2026-04-10',
          items: [
            {
              description: 'Invalid item',
              quantity: 1,
              rate: 0
            }
          ],
          totals: { grandTotal: 0 }
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CREDIT_AMOUNT');
    });

    it('rejects credit note issuance if linked invoice belongs to another tenant', async () => {
      const res = await request(app)
        .post('/api/v1/credit-notes')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          clientId: clientBId,
          invoiceId: invoice1Id, // Invoice belongs to Org A
          date: '2026-04-10',
          items: [
            {
              description: 'Cross tenant attempt',
              quantity: 1,
              rate: 1000
            }
          ]
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INVOICE_NOT_FOUND');
    });
  });

  // ─── Phase 77: Atomic Multi-Document ACID Transactions ──────────────
  describe('Phase 77: Atomic Credit Note Issuance & Transaction Session', () => {
    it('verifies linked invoice amountDue reduced atomically and creditNoteId is attached', async () => {
      const updatedInv1 = await Invoice.findById(invoice1Id);
      expect(updatedInv1).toBeDefined();
      // Original 10000 - 3000 = 7000 due
      expect(updatedInv1?.totals.amountDue).toBe(7000);
      expect(updatedInv1?.creditNoteIds.map((id) => id.toString())).toContain(creditNote1Id);
    });

    it('transitions invoice status to Paid when credit note settles the remaining amount due', async () => {
      // Settle remaining ₹7,000 via second credit note
      const res = await request(app)
        .post('/api/v1/credit-notes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          invoiceId: invoice1Id,
          date: '2026-04-12',
          reason: 'Service Cancellation',
          items: [
            {
              description: 'Full balance cancellation',
              quantity: 1,
              rate: 7000,
              gstPercentage: 0
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.creditNoteNo).toBe('CN-002');
      expect(res.body.data.creditAppliedToInvoice).toBe(7000);

      // Verify invoice status updated to Paid and amountDue is 0
      const updatedInv = await Invoice.findById(invoice1Id);
      expect(updatedInv?.totals.amountDue).toBe(0);
      expect(updatedInv?.status).toBe('Paid');
    });

    it('enforces rollback & credit limit check: cannot credit more than invoice grand total', async () => {
      // Invoice 1 total is 10,000 and already has 10,000 credited (3000 + 7000). Max allowable credit is now 0.
      const res = await request(app)
        .post('/api/v1/credit-notes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          invoiceId: invoice1Id,
          date: '2026-04-15',
          items: [
            {
              description: 'Excess credit attempt',
              quantity: 1,
              rate: 1000
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CREDIT_LIMIT_EXCEEDED');

      // Assert no phantom credit note was saved
      const phantomCn = await CreditNote.findOne({ creditNoteNo: 'CN-003' });
      expect(phantomCn).toBeNull();
    });
  });

  // ─── Phase 78: Ledger Stream Integration & Chronological Recalculation
  describe('Phase 78: Client Ledger Integration', () => {
    it('merges credit notes as credit entries in the chronological running balance ledger', async () => {
      const res = await request(app)
        .get(`/api/v1/ledger/${clientAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { entries, openingBalance, totalDebits, totalCredits, totalCreditNotes, closingBalance } = res.body.data;

      expect(openingBalance).toBe(1000);
      expect(totalDebits).toBe(10000); // Invoice 1 (+10,000)
      expect(totalCredits).toBe(10000); // CN-001 (3,000) + CN-002 (7,000)
      expect(totalCreditNotes).toBe(10000);
      // 1000 (opening) + 10000 (invoice) - 10000 (credit notes) = 1000
      expect(closingBalance).toBe(1000);

      // Verify entries stream includes Credit Note items
      const cnEntries = entries.filter((e: any) => e.type === 'Credit Note');
      expect(cnEntries.length).toBe(2);
      expect(cnEntries[0].referenceNo).toBe('CN-001');
      expect(cnEntries[0].credit).toBe(3000);
      expect(cnEntries[0].invoiceNo).toBe('INV-1001');
      expect(cnEntries[1].referenceNo).toBe('CN-002');
      expect(cnEntries[1].credit).toBe(7000);
    });
  });

  // ─── Phase 79: Credit Note Read & Directory APIs ─────────────────────
  describe('Phase 79: Credit Note Read & Directory APIs', () => {
    it('retrieves filterable list of credit notes with populated invoice and client data', async () => {
      const res = await request(app)
        .get('/api/v1/credit-notes')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.creditNotes[0].clientId.name).toBe('Tata Consultancy Services Test');
      expect(res.body.data.creditNotes[0].invoiceId.invoiceNo).toBe('INV-1001');
    });

    it('retrieves single credit note by ID with populated particulars', async () => {
      const res = await request(app)
        .get(`/api/v1/credit-notes/${creditNote1Id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(creditNote1Id);
      expect(res.body.data.creditNoteNo).toBe('CN-001');
      expect(res.body.data.items[0].description).toBe('Overcharge adjustment on Advisory fee');
    });

    it('enforces multi-tenant isolation: Org B cannot access Org A credit note', async () => {
      const res = await request(app)
        .get(`/api/v1/credit-notes/${creditNote1Id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CREDIT_NOTE_NOT_FOUND');
    });
  });

  // ─── Phase 80: Unallocated Credit Application & Cash Refunds ─────────
  describe('Phase 80: Unallocated Credit Application & Cash Refunds', () => {
    beforeAll(async () => {
      // Create Invoice 2 (Fully Paid already: grandTotal: 5000, amountPaid: 5000, amountDue: 0)
      const inv2 = await Invoice.create({
        tenantId: orgAId,
        clientId: clientAId,
        invoiceNo: 'INV-1002',
        date: new Date('2026-04-18'),
        items: [
          {
            referenceType: 'Manual',
            particulars: 'Retainer Services',
            quantity: 1,
            rate: 5000,
            discount: 0,
            taxableAmount: 5000,
            gstPercentage: 0,
            gstAmount: 0,
            total: 5000
          }
        ],
        totals: {
          subtotal: 5000,
          totalDiscount: 0,
          totalTaxable: 5000,
          totalGst: 0,
          roundOff: 0,
          grandTotal: 5000,
          amountPaid: 5000,
          amountDue: 0
        },
        status: 'Paid',
        creditNoteIds: []
      });
      invoice2Id = inv2._id.toString();

      // Issue Credit Note of ₹2,000 on Invoice 2 -> Because invoice has amountDue: 0, all 2,000 becomes unallocatedCredit
      const resCn = await request(app)
        .post('/api/v1/credit-notes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          invoiceId: invoice2Id,
          date: '2026-04-20',
          reason: 'Goodwill Discount',
          items: [{ description: 'Goodwill credit', quantity: 1, rate: 2000, gstPercentage: 0 }]
        });

      unallocatedCreditNoteId = resCn.body.data._id;

      // Create Invoice 3 (₹3,000, Unpaid) to test applying credit to another invoice
      const inv3 = await Invoice.create({
        tenantId: orgAId,
        clientId: clientAId,
        invoiceNo: 'INV-1003',
        date: new Date('2026-04-22'),
        items: [
          {
            referenceType: 'Manual',
            particulars: 'Audit Services',
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
          amountPaid: 0,
          amountDue: 3000
        },
        status: 'Unpaid',
        creditNoteIds: []
      });
      invoice3Id = inv3._id.toString();
    });

    it('creates credit note on fully paid invoice with status "Issued" and unallocatedCredit: 2000', async () => {
      const cn = await CreditNote.findById(unallocatedCreditNoteId);
      expect(cn?.status).toBe('Issued');
      expect(cn?.creditAppliedToInvoice).toBe(0);
      expect(cn?.unallocatedCredit).toBe(2000);
    });

    it('applies ₹1,200 of unallocated credit to Invoice 3, reducing its amountDue to ₹1,800', async () => {
      const res = await request(app)
        .post(`/api/v1/credit-notes/${unallocatedCreditNoteId}/apply`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          targetInvoiceId: invoice3Id,
          amountToApply: 1200
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amountApplied).toBe(1200);
      expect(res.body.data.creditNote.unallocatedCredit).toBe(800);
      expect(res.body.data.targetInvoice.totals.amountDue).toBe(1800);
      expect(res.body.data.targetInvoice.status).toBe('Partially Paid');
    });

    it('records cash/bank refund of the remaining ₹800 credit, transitioning status to "Refunded"', async () => {
      const res = await request(app)
        .post(`/api/v1/credit-notes/${unallocatedCreditNoteId}/refund`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          refundMode: 'Bank Transfer',
          referenceNo: 'HDFC-REF-998877',
          refundedAmount: 800,
          notes: 'Direct NEFT refund of excess credit'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.unallocatedCredit).toBe(0);
      expect(res.body.data.status).toBe('Refunded');
      expect(res.body.data.refundDetails.refundMode).toBe('Bank Transfer');
      expect(res.body.data.refundDetails.referenceNo).toBe('HDFC-REF-998877');
    });
  });
});
