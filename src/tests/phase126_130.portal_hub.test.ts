import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import connectDB from '../config/db';
import { generateClientToken } from '../services/client-auth.service';
import { Organization } from '../modules/auth/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { ClientUser } from '../models/ClientUser';
import { Task } from '../models/Task';
import { DocumentModel } from '../models/Document';
import { DocumentRequest } from '../models/DocumentRequest';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
import { ClientQueryTicket } from '../models/ClientQueryTicket';

describe('Part 26 (Phases 126–130): Compliance, Documents & Billing Hub', () => {
  let tenantId: mongoose.Types.ObjectId;
  let clientId: mongoose.Types.ObjectId;
  let clientUserId: mongoose.Types.ObjectId;
  let clientToken: string;

  let otherTenantId: mongoose.Types.ObjectId;
  let otherClientId: mongoose.Types.ObjectId;
  let otherClientUserId: mongoose.Types.ObjectId;
  let otherClientToken: string;

  beforeAll(async () => {
    await connectDB();

    tenantId = new mongoose.Types.ObjectId();
    clientId = new mongoose.Types.ObjectId();
    clientUserId = new mongoose.Types.ObjectId();

    otherTenantId = new mongoose.Types.ObjectId();
    otherClientId = new mongoose.Types.ObjectId();
    otherClientUserId = new mongoose.Types.ObjectId();

    const ts = Date.now();
    // Create Tenant Organizations
    await Organization.create([
      { _id: tenantId, name: 'Apex Accounting LLP', slug: `apex-${ts}`, isActive: true },
      { _id: otherTenantId, name: 'Other Tax Partners', slug: `other-${ts}`, isActive: true }
    ]);

    // Create Clients with allowLogin: true
    await Client.create([
      {
        _id: clientId,
        tenantId,
        name: 'Horizon Retailers Pvt Ltd',
        pan: 'ABCDE1234F',
        isActive: true,
        allowLogin: true
      },
      {
        _id: otherClientId,
        tenantId: otherTenantId,
        name: 'Unrelated Corp',
        pan: 'XYZAB5678C',
        isActive: true,
        allowLogin: true
      }
    ]);

    // Create Client Users
    await ClientUser.create([
      {
        _id: clientUserId,
        tenantId,
        clientId,
        name: 'Rohan Sharma',
        email: 'rohan@horizon.com',
        phone: '+919876543210',
        isActive: true,
        isPrimaryContact: true,
        tokenVersion: 0
      },
      {
        _id: otherClientUserId,
        tenantId: otherTenantId,
        clientId: otherClientId,
        name: 'Other User',
        email: 'other@corp.com',
        phone: '+919999988888',
        isActive: true,
        isPrimaryContact: true,
        tokenVersion: 0
      }
    ]);

    // Generate Scoped Client JWT Tokens
    clientToken = generateClientToken({
      clientUserId: clientUserId.toString(),
      clientId: clientId.toString(),
      tenantId: tenantId.toString(),
      role: 'Client',
      isClient: true,
      tokenVersion: 0
    }).accessToken;

    otherClientToken = generateClientToken({
      clientUserId: otherClientUserId.toString(),
      clientId: otherClientId.toString(),
      tenantId: otherTenantId.toString(),
      role: 'Client',
      isClient: true,
      tokenVersion: 0
    }).accessToken;

    // Seed Sample Data for Tenant A
    await Task.create({
      tenantId,
      clientId,
      serviceId: new mongoose.Types.ObjectId(),
      description: 'GSTR-3B Return Filing',
      period: { month: 10, year: 2026, label: 'Oct 2026' },
      status: 'In Progress',
      dueDate: new Date('2026-11-20'),
      isBillable: true
    });

    await DocumentModel.create({
      tenantId,
      clientId,
      category: 'document',
      fileName: 'GST_Certificate_2026.pdf',
      fileUrl: '/uploads/documents/sample-gst.pdf',
      uploadedBy: clientUserId
    });

    await Invoice.create({
      tenantId,
      clientId,
      invoiceNo: 'INV-TEST-001',
      date: new Date('2026-10-15'),
      dueDate: new Date('2026-10-31'),
      status: 'Unpaid',
      items: [
        {
          referenceType: 'Manual',
          particulars: 'Monthly Accounting & Compliance',
          quantity: 1,
          rate: 15000,
          discount: 0,
          taxableAmount: 15000,
          gstPercentage: 18,
          gstAmount: 2700,
          total: 17700
        }
      ],
      totals: {
        subtotal: 15000,
        totalDiscount: 0,
        totalTaxable: 15000,
        totalGst: 2700,
        roundOff: 0,
        grandTotal: 17700,
        amountPaid: 0,
        amountDue: 17700
      }
    });

    await Receipt.create({
      tenantId,
      clientId,
      receiptNo: 'RCT-TEST-001',
      date: new Date('2026-10-20'),
      paymentMode: 'Bank Transfer',
      referenceNumber: 'NEFT99887766',
      totalAmount: 10000,
      settlements: [],
      unallocatedAmount: 10000
    });

    await DocumentRequest.create({
      tenantId,
      clientId,
      requestNo: 'REQ-2026-001',
      title: 'October Bank Statements Required',
      token: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      status: 'Pending',
      items: [
        {
          name: 'HDFC Current A/c Statement (Oct 2026)',
          isRequired: true,
          acceptedFormats: ['.pdf'],
          status: 'Pending'
        }
      ],
      createdBy: clientUserId
    });
  });

  afterAll(async () => {
    await Task.deleteMany({ clientId: { $in: [clientId, otherClientId] } });
    await DocumentModel.deleteMany({ clientId: { $in: [clientId, otherClientId] } });
    await Invoice.deleteMany({ clientId: { $in: [clientId, otherClientId] } });
    await Receipt.deleteMany({ clientId: { $in: [clientId, otherClientId] } });
    await DocumentRequest.deleteMany({ clientId: { $in: [clientId, otherClientId] } });
    await ClientQueryTicket.deleteMany({ clientId: { $in: [clientId, otherClientId] } });
    await ClientUser.deleteMany({ _id: { $in: [clientUserId, otherClientUserId] } });
    await Client.deleteMany({ _id: { $in: [clientId, otherClientId] } });
    await Organization.deleteMany({ _id: { $in: [tenantId, otherTenantId] } });
    await mongoose.disconnect();
  });

  // ─── Phase 126: Compliance Calendar & Milestones ─────────────────
  describe('Phase 126: Client Compliance Calendar API', () => {
    it('GET /api/v1/portal/compliance-calendar should return statutory milestones for authenticated client', async () => {
      const res = await request(app)
        .get('/api/v1/portal/compliance-calendar')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const milestone = res.body.data[0];
      expect(milestone.complianceName).toContain('GSTR-3B Return Filing');
      expect(milestone.serviceCategory).toBe('GST');
      expect(milestone.status).toBe('In Progress');
    });

    it('should isolate compliance milestones across different tenants', async () => {
      const res = await request(app)
        .get('/api/v1/portal/compliance-calendar')
        .set('Authorization', `Bearer ${otherClientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });
  });

  // ─── Phase 127: Documents Repository & Return Vault ──────────────
  describe('Phase 127: Client Documents Repository API', () => {
    it('GET /api/v1/portal/documents should retrieve client-scoped documents', async () => {
      const res = await request(app)
        .get('/api/v1/portal/documents')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].fileName).toBe('GST_Certificate_2026.pdf');
    });

    it('GET /api/v1/portal/documents/:id/download should retrieve download details for client file', async () => {
      const doc = await DocumentModel.findOne({ clientId });
      const res = await request(app)
        .get(`/api/v1/portal/documents/${doc!._id}/download`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.fileName).toBe('GST_Certificate_2026.pdf');
    });

    it('should forbid other tenants from downloading client documents', async () => {
      const doc = await DocumentModel.findOne({ clientId });
      const res = await request(app)
        .get(`/api/v1/portal/documents/${doc!._id}/download`)
        .set('Authorization', `Bearer ${otherClientToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── Phase 128: Client Invoices, Receipts & Ledger Statement ────
  describe('Phase 128: Invoices, Receipts & Ledger API', () => {
    it('GET /api/v1/portal/invoices should return client invoices with outstanding balances', async () => {
      const res = await request(app)
        .get('/api/v1/portal/invoices')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const inv = res.body.data[0];
      expect(inv.invoiceNo).toBe('INV-TEST-001');
      expect(inv.grandTotal).toBe(17700);
      expect(inv.amountDue).toBe(17700);
    });

    it('GET /api/v1/portal/receipts should return client payment receipts', async () => {
      const res = await request(app)
        .get('/api/v1/portal/receipts')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].receiptNo).toBe('RCT-TEST-001');
      expect(res.body.data[0].totalAmount).toBe(10000);
    });

    it('GET /api/v1/portal/ledger should calculate client running balance', async () => {
      const res = await request(app)
        .get('/api/v1/portal/ledger')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.runningBalance).toBeDefined();
    });
  });

  // ─── Phase 129: Document Request Fulfillment Service ─────────────
  describe('Phase 129: Document Request Fulfillment API', () => {
    it('GET /api/v1/portal/document-requests should return pending requests for client', async () => {
      const res = await request(app)
        .get('/api/v1/portal/document-requests')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].requestNo).toBe('REQ-2026-001');
    });

    it('POST /api/v1/portal/requests/:id/fulfill should accept file and update request status', async () => {
      const reqDoc = await DocumentRequest.findOne({ clientId });
      const itemId = reqDoc!.items[0]._id;

      const res = await request(app)
        .post(`/api/v1/portal/requests/${reqDoc!._id}/fulfill`)
        .set('Authorization', `Bearer ${clientToken}`)
        .field('itemId', itemId!.toString())
        .attach('file', Buffer.from('Mock Bank Statement Content'), 'hdfc_oct_2026.pdf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.request.status).toBe('Completed');
    });
  });

  // ─── Phase 130: Client Service Requests & Support Queries ─────────
  describe('Phase 130: Client Queries & Support Tickets API', () => {
    let createdTicketId: string;

    it('POST /api/v1/portal/queries should create a new support query ticket', async () => {
      const res = await request(app)
        .post('/api/v1/portal/queries')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          type: 'Service Request',
          subject: 'Need Trademark Registration for Brand',
          message: 'We are launching a new consumer brand next month and need trademark filing.'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ticketNo).toMatch(/^TKT-2026-\d{4}$/);
      expect(res.body.data.status).toBe('Open');
      expect(res.body.data.subject).toBe('Need Trademark Registration for Brand');

      createdTicketId = res.body.data._id;
    });

    it('GET /api/v1/portal/queries should list tickets for the client', async () => {
      const res = await request(app)
        .get('/api/v1/portal/queries')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.some((t: any) => t._id === createdTicketId)).toBe(true);
    });

    it('GET /api/v1/portal/queries/:id should return details of specific ticket', async () => {
      const res = await request(app)
        .get(`/api/v1/portal/queries/${createdTicketId}`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.subject).toBe('Need Trademark Registration for Brand');
    });

    it('should prevent other client from reading tickets belonging to another client', async () => {
      const res = await request(app)
        .get(`/api/v1/portal/queries/${createdTicketId}`)
        .set('Authorization', `Bearer ${otherClientToken}`);

      expect(res.status).toBe(404);
    });
  });
});
