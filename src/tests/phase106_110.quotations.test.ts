import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { Quotation } from '../models/Quotation';
import { Invoice } from '../models/Invoice';
import dotenv from 'dotenv';

dotenv.config();
jest.setTimeout(30000);

describe('Part 22: Quotations & Pre-Sales CRM Engine (Phases 106–110)', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;
  let clientAId: string;
  let clientBId: string;

  const orgASlug = 'quote-orga-p22';
  const orgBSlug = 'quote-orgb-p22';
  const userAEmail = 'adminA.quote22@example.com';
  const userBEmail = 'adminB.quote22@example.com';

  beforeAll(async () => {
    await connectDB();

    // Clean up stale test data
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });
    await Quotation.deleteMany({}).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({
      name: 'Alpha Advisory Services',
      slug: orgASlug,
      address: {
        addressLine1: '101 Nariman Point',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        pincode: '400021'
      },
      gstin: '27AAAAA0000A1Z5',
      pan: 'AAAAA0000A'
    });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Super Admin A',
      isSuperAdmin: true,
      permissions: {}
    });

    await User.create({
      tenantId: orgAId,
      name: 'Partner User A',
      username: 'partner_a_p22',
      email: userAEmail,
      password: 'password123',
      roleId: roleA._id
    });

    // Setup Org B (for multi-tenant isolation testing)
    const orgB = await Organization.create({
      name: 'Beta Consultants LLP',
      slug: orgBSlug,
      address: {
        addressLine1: '404 Connaught Place',
        city: 'New Delhi',
        state: 'Delhi',
        country: 'India',
        pincode: '110001'
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
      name: 'Partner User B',
      username: 'partner_b_p22',
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
      name: 'Zenith Logistics Ltd',
      fileNo: 'QT-CLI-001',
      pan: 'ABCDE1234F',
      gstin: '27ABCDE1234F1Z5',
      email: 'finance@zenith.com',
      mobile: '9876543210',
      contactPersonName: 'Amit Sharma',
      city: 'Pune',
      state: 'Maharashtra'
    });
    clientAId = (clientA._id as mongoose.Types.ObjectId).toString();

    const clientB = await Client.create({
      tenantId: orgBId,
      name: 'Horizon Retail Corp',
      fileNo: 'QT-CLI-002',
      pan: 'XYZAB5678C',
      email: 'accounts@horizon.com',
      mobile: '9876543211',
      contactPersonName: 'Neha Verma',
      city: 'Gurugram',
      state: 'Haryana'
    });
    clientBId = (clientB._id as mongoose.Types.ObjectId).toString();
  });

  afterAll(async () => {
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });
    await Client.deleteMany({ _id: { $in: [clientAId, clientBId] } }).setOptions({ skipTenantPlugin: true });
    await Quotation.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await Invoice.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
  });

  let createdQuote1Id: string;
  let createdQuote2Id: string;

  describe('Phase 106 & 107: Quotation Creation, GST Tax Math & Directory Filtering', () => {
    it('should create an intra-state quotation with auto-sequence QT-001 and CGST/SGST split', async () => {
      const payload = {
        clientId: clientAId,
        date: new Date().toISOString(),
        isInterState: false,
        items: [
          {
            description: 'Statutory Audit FY 2025-26',
            sacCode: '998222',
            rate: 25000,
            quantity: 1,
            discount: 1000,
            gstPercentage: 18
          },
          {
            description: 'Tax Audit 44AB Filing',
            sacCode: '998231',
            rate: 15000,
            quantity: 1,
            discount: 0,
            gstPercentage: 18
          }
        ],
        termsAndConditions: 'Payment 50% advance, balance upon submission.',
        notes: 'Pre-sales proposal for FY 2025-26 audits'
      };

      const res = await request(app)
        .post('/api/v1/quotations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.quotationNo).toBe('QT-001');
      expect(res.body.data.status).toBe('Draft');

      // Verify Tax Math:
      // Item 1: rate 25000 - disc 1000 = taxable 24000. 18% GST = 4320 (CGST 2160, SGST 2160). Total = 28320
      // Item 2: rate 15000 - disc 0 = taxable 15000. 18% GST = 2700 (CGST 1350, SGST 1350). Total = 17700
      // Subtotal = 40000, discountTotal = 1000, taxableTotal = 39000
      // CGST = 3510, SGST = 3510, IGST = 0. TaxTotal = 7020
      // GrandTotal = 46020
      const totals = res.body.data.totals;
      expect(totals.subtotal).toBe(40000);
      expect(totals.discountTotal).toBe(1000);
      expect(totals.taxableTotal).toBe(39000);
      expect(totals.cgstTotal).toBe(3510);
      expect(totals.sgstTotal).toBe(3510);
      expect(totals.igstTotal).toBe(0);
      expect(totals.taxTotal).toBe(7020);
      expect(totals.grandTotal).toBe(46020);

      createdQuote1Id = res.body.data._id;
    });

    it('should create an inter-state quotation with sequence QT-002 and IGST tax calculation', async () => {
      const payload = {
        clientId: clientAId,
        isInterState: true,
        items: [
          {
            description: 'International Transfer Pricing Advisory',
            sacCode: '998232',
            rate: 50000,
            quantity: 1,
            gstPercentage: 18
          }
        ]
      };

      const res = await request(app)
        .post('/api/v1/quotations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data.quotationNo).toBe('QT-002');
      expect(res.body.data.totals.cgstTotal).toBe(0);
      expect(res.body.data.totals.sgstTotal).toBe(0);
      expect(res.body.data.totals.igstTotal).toBe(9000); // 18% of 50000
      expect(res.body.data.totals.grandTotal).toBe(59000);

      createdQuote2Id = res.body.data._id;
    });

    it('should list quotations with pagination and pipeline value summary', async () => {
      const res = await request(app)
        .get('/api/v1/quotations')
        .set('Authorization', `Bearer ${tokenA}`)
        .query({ status: 'Draft' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.quotations.length).toBe(2);
      expect(res.body.data.summary.totalCount).toBe(2);
      expect(res.body.data.summary.totalValue).toBe(105020); // 46020 + 59000
      expect(res.body.data.summary.draftValue).toBe(105020);
    });

    it('should retrieve single quotation details with populated client fields', async () => {
      const res = await request(app)
        .get(`/api/v1/quotations/${createdQuote1Id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(createdQuote1Id);
      expect(res.body.data.clientId.name).toBe('Zenith Logistics Ltd');
      expect(res.body.data.items.length).toBe(2);
    });

    it('should update quotation items and automatically recompute totals', async () => {
      const res = await request(app)
        .put(`/api/v1/quotations/${createdQuote1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          items: [
            {
              description: 'Statutory Audit FY 2025-26 (Revised)',
              rate: 30000,
              quantity: 1,
              discount: 0,
              gstPercentage: 18
            }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.totals.taxableTotal).toBe(30000);
      expect(res.body.data.totals.grandTotal).toBe(35400); // 30000 + 18% (5400)
    });
  });

  describe('Phase 108: Quotation Status Lifecycle & Email Proposal Dispatch', () => {
    it('should transition status from Draft to Sent', async () => {
      const res = await request(app)
        .patch(`/api/v1/quotations/${createdQuote1Id}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'Sent' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Sent');
      expect(res.body.data.sentAt).toBeDefined();
    });

    it('should dispatch proposal email to client and set sent timestamp', async () => {
      const res = await request(app)
        .post(`/api/v1/quotations/${createdQuote2Id}/send`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ email: 'client.finance@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sent).toBe(true);
      expect(res.body.data.email).toBe('client.finance@example.com');

      const quote2 = await Quotation.findById(createdQuote2Id);
      expect(quote2?.status).toBe('Sent');
    });

    it('should update status to Accepted upon client agreement', async () => {
      const res = await request(app)
        .patch(`/api/v1/quotations/${createdQuote1Id}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'Accepted' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Accepted');
    });
  });

  let generatedInvoiceId: string;

  describe('Phase 109: 1-Click "Convert to Invoice" Atomic Engine', () => {
    it('should convert accepted quotation into an active Invoice and mark status as Converted', async () => {
      const res = await request(app)
        .post(`/api/v1/quotations/${createdQuote1Id}/convert-to-invoice`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'Unpaid' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.quotation.status).toBe('Converted');
      expect(res.body.data.quotation.convertedInvoiceId).toBeDefined();
      expect(res.body.data.invoice.invoiceNo).toBeDefined();
      expect(res.body.data.invoice.totals.grandTotal).toBe(35400);

      generatedInvoiceId = res.body.data.invoice._id;

      // Verify invoice exists in database
      const checkInvoice = await Invoice.findById(generatedInvoiceId);
      expect(checkInvoice).toBeDefined();
      expect(checkInvoice?.clientId.toString()).toBe(clientAId);
      expect(checkInvoice?.totals.grandTotal).toBe(35400);
      expect(checkInvoice?.items[0].referenceType).toBe('Manual');
      expect(checkInvoice?.items[0].particulars).toContain('Statutory Audit');
    });

    it('should reject re-converting an already-converted quotation with HTTP 400', async () => {
      const res = await request(app)
        .post(`/api/v1/quotations/${createdQuote1Id}/convert-to-invoice`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error?.message || res.body.message).toContain('already been converted');
    });

    it('should reject editing or deleting a quotation once it has been converted', async () => {
      // Attempt to edit converted quotation
      const editRes = await request(app)
        .put(`/api/v1/quotations/${createdQuote1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ notes: 'Attempted edit' });

      expect(editRes.status).toBe(400);
      expect(editRes.body.error?.message || editRes.body.message).toContain('Cannot edit a quotation that has already been converted');

      // Attempt to delete converted quotation
      const deleteRes = await request(app)
        .delete(`/api/v1/quotations/${createdQuote1Id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(deleteRes.status).toBe(400);
      expect(deleteRes.body.error?.message || deleteRes.body.message).toContain('Cannot delete a converted quotation');
    });
  });

  describe('Phase 110: Printable Layout & Sales Pipeline Analytics', () => {
    it('should return print layout structure with Indian currency words', async () => {
      const res = await request(app)
        .get(`/api/v1/quotations/${createdQuote1Id}/print`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.quotation).toBeDefined();
      expect(res.body.data.firm.name).toBe('Alpha Advisory Services');
      expect(res.body.data.firm.gstin).toBe('27AAAAA0000A1Z5');
      expect(res.body.data.amountInWords).toBeDefined();
      expect(res.body.data.amountInWords).toContain('Rupees Only');
    });

    it('should compute pre-sales pipeline analytics including conversion rate %', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/quotation-pipeline')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const overview = res.body.data.overview;
      expect(overview.totalQuotations).toBe(2);
      expect(overview.convertedCount).toBe(1);
      expect(overview.convertedValue).toBe(35400);
      expect(overview.conversionRatePercentage).toBe(50); // 1 converted out of 2 = 50%
      expect(res.body.data.statusBreakdown.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.monthlyTrends.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Multi-Tenant Security Isolation', () => {
    it('should prevent Tenant B from accessing, modifying, or converting Tenant A quotations', async () => {
      // Tenant B queries Tenant A quote
      const getRes = await request(app)
        .get(`/api/v1/quotations/${createdQuote1Id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(getRes.status).toBe(404);

      // Tenant B attempts to update Tenant A quote
      const putRes = await request(app)
        .put(`/api/v1/quotations/${createdQuote1Id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ notes: 'Tenant B unauthorized update' });

      expect(putRes.status).toBe(404);

      // Tenant B attempts to convert Tenant A quote
      const convertRes = await request(app)
        .post(`/api/v1/quotations/${createdQuote1Id}/convert-to-invoice`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(convertRes.status).toBe(404);
    });
  });
});
