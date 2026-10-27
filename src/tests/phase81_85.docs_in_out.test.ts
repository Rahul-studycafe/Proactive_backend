import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { PhysicalDocumentModel } from '../models/PhysicalDocument';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 17: Documents In-Out Register & Client Asset Custody (Phases 81–85)', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let userAId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;
  let tokenStaffRestricted: string;
  let clientAId: string;
  let clientBId: string;
  let testDoc1Id: string;
  let testDocReturnableId: string;
  let testDocOverdueId: string;

  const orgASlug = 'docs-orga-p81';
  const orgBSlug = 'docs-orgb-p81';
  const userAEmail = 'admina.docs81@example.com';
  const userBEmail = 'adminb.docs81@example.com';
  const staffRestrictedEmail = 'staff.restricted81@example.com';

  beforeAll(async () => {
    await connectDB();

    // Clean up stale organizations and users
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [userAEmail, userBEmail, staffRestrictedEmail] }
    }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({
      name: 'Apex Advisory Services LLP',
      slug: orgASlug,
      address: {
        addressLine1: '401 Fortune Business Park',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        pincode: '400051'
      }
    });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    // Super Admin Role for Org A
    const superAdminRoleA = await Role.create({
      tenantId: orgAId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    // Restricted Role without docsInOut permissions
    const restrictedRole = await Role.create({
      tenantId: orgAId,
      name: 'No Docs Access Staff',
      isSuperAdmin: false,
      permissions: {
        docsInOut: {
          create: { allowed: false, scope: 'everything' },
          edit: { allowed: false, scope: 'everything' },
          view: { allowed: false, scope: 'everything' },
          delete: { allowed: false, scope: 'everything' }
        }
      }
    });

    const userA = await User.create({
      tenantId: orgAId,
      name: 'Rajesh Varma (Partner)',
      username: 'rajesh_docs81',
      email: userAEmail,
      password: 'password123',
      roleId: superAdminRoleA._id
    });
    userAId = userA._id as mongoose.Types.ObjectId;

    await User.create({
      tenantId: orgAId,
      name: 'Intern Rahul',
      username: 'rahul_docs81',
      email: staffRestrictedEmail,
      password: 'password123',
      roleId: restrictedRole._id
    });

    // Login Org A Admin
    const loginResA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userAEmail, password: 'password123' });
    tokenA = loginResA.body.data.accessToken;

    // Login Restricted Staff
    const loginResRestricted = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: staffRestrictedEmail, password: 'password123' });
    tokenStaffRestricted = loginResRestricted.body.data.accessToken;

    // Create Client for Org A
    const clientA = await Client.create({
      tenantId: orgAId,
      name: 'Horizon Infra Tech Pvt Ltd',
      email: 'contact@horizoninfra.com',
      mobile: '9820011223',
      pan: 'AABCH9876K',
      gstin: '27AABCH9876K1ZQ',
      entityType: 'Private Limited'
    });
    clientAId = clientA._id.toString();

    // Setup Org B for tenant isolation tests
    const orgB = await Organization.create({
      name: 'Delta Tax Consultants',
      slug: orgBSlug
    });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const superAdminRoleB = await Role.create({
      tenantId: orgBId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    await User.create({
      tenantId: orgBId,
      name: 'Sneha Rao',
      username: 'sneha_docs81',
      email: userBEmail,
      password: 'password123',
      roleId: superAdminRoleB._id
    });

    const loginResB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userBEmail, password: 'password123' });
    tokenB = loginResB.body.data.accessToken;

    const clientB = await Client.create({
      tenantId: orgBId,
      name: 'Zeta Traders',
      email: 'zeta@example.com',
      mobile: '9988776655',
      pan: 'BBBBB1234B',
      entityType: 'Partnership Firm'
    });
    clientBId = clientB._id.toString();
  });

  afterAll(async () => {
    await PhysicalDocumentModel.deleteMany({
      tenantId: { $in: [orgAId, orgBId] }
    });
    await Client.deleteMany({ tenantId: { $in: [orgAId, orgBId] } });
    await User.deleteMany({
      tenantId: { $in: [orgAId, orgBId] }
    }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } });
    await Organization.deleteMany({ _id: { $in: [orgAId, orgBId] } });
  });

  // ─── Phase 81 & 82: Physical Document Model & CRUD APIs ─────────
  describe('Phase 81 & 82: Movement Logging and CRUD APIs', () => {
    it('rejects document creation when isReturnable=true but returnDate is missing', async () => {
      const res = await request(app)
        .post('/api/v1/docs-in-out')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          category: 'Received',
          documentType: 'Original Deeds',
          documentName: 'Title Deed - Bandra Commercial Unit',
          location: 'Cabinet A, Safe Drawer 1',
          isReturnable: true
          // Missing returnDate
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('successfully logs incoming physical document (Received) with status "In Custody"', async () => {
      const res = await request(app)
        .post('/api/v1/docs-in-out')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          category: 'Received',
          documentType: 'Original Deeds',
          documentName: 'Original Title Deed - Bandra Commercial Complex',
          location: 'Cabinet A, Safe Drawer 1',
          isReturnable: false,
          receivedByPersonName: 'Sunil Mehta (Director)',
          receivedByPhone: '9820099887',
          notes: 'Received original 1998 conveyance deed for bank charge creation'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBeDefined();
      expect(res.body.data.status).toBe('In Custody');
      expect(res.body.data.category).toBe('Received');
      expect(res.body.data.documentType).toBe('Original Deeds');
      expect(res.body.data.location).toBe('Cabinet A, Safe Drawer 1');
      expect(res.body.data.clientId.name).toBe('Horizon Infra Tech Pvt Ltd');
      expect(res.body.data.custodianUserId.name).toBe('Rajesh Varma (Partner)');

      testDoc1Id = res.body.data._id;
    });

    it('creates a returnable physical document with future return date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14);

      const res = await request(app)
        .post('/api/v1/docs-in-out')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          category: 'Received',
          documentType: 'Passbook',
          documentName: 'HDFC Current Account Bank Passbook',
          location: 'Cabinet B, Shelf 2',
          isReturnable: true,
          returnDate: futureDate.toISOString(),
          receivedByPersonName: 'Accounts Officer Rakesh',
          notes: 'Needed for statutory audit verification'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isReturnable).toBe(true);
      expect(res.body.data.status).toBe('In Custody');
      expect(res.body.data.returnDate).toBeDefined();

      testDocReturnableId = res.body.data._id;
    });

    it('logs outgoing document (Given) without returnable automatically setting status to "Returned"', async () => {
      const res = await request(app)
        .post('/api/v1/docs-in-out')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          category: 'Given',
          documentType: 'Registration Certificate',
          documentName: 'Original GST Registration Certificate Hardcopy',
          location: 'Dispatched to Client Office',
          isReturnable: false,
          receivedByPersonName: 'Courier - BlueDart Track #BL9988',
          notes: 'Handed over framed original certificate after registration'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Returned');
      expect(res.body.data.actualReturnedDate).toBeDefined();
    });

    it('retrieves detailed document record by ID populated with client & custodian', async () => {
      const res = await request(app)
        .get(`/api/v1/docs-in-out/${testDoc1Id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(testDoc1Id);
      expect(res.body.data.documentName).toBe(
        'Original Title Deed - Bandra Commercial Complex'
      );
      expect(res.body.data.clientId.name).toBe('Horizon Infra Tech Pvt Ltd');
      expect(res.body.data.custodianUserId.email).toBe(userAEmail);
    });

    it('updates document metadata and physical storage shelf location', async () => {
      const res = await request(app)
        .put(`/api/v1/docs-in-out/${testDoc1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          location: 'Fireproof Safe 2, Shelf D-4',
          notes: 'Moved to fireproof safe for high security'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.location).toBe('Fireproof Safe 2, Shelf D-4');
      expect(res.body.data.notes).toBe(
        'Moved to fireproof safe for high security'
      );
    });

    it('deletes an accidental document entry', async () => {
      // Create a temporary document to delete
      const tempRes = await request(app)
        .post('/api/v1/docs-in-out')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          category: 'Received',
          documentType: 'Company Seal',
          documentName: 'Temporary Duplicate Seal',
          location: 'Desk Drawer'
        });

      const tempId = tempRes.body.data._id;

      const delRes = await request(app)
        .delete(`/api/v1/docs-in-out/${tempId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      const checkRes = await request(app)
        .get(`/api/v1/docs-in-out/${tempId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(checkRes.status).toBe(404);
    });
  });

  // ─── Phase 83: Filtered Directory, Search & Storage Location Aggregation ───
  describe('Phase 83: Directory Filtering, Search & Storage Location Master', () => {
    it('lists documents with search filtering by document name', async () => {
      const res = await request(app)
        .get('/api/v1/docs-in-out?search=Passbook')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.data[0].documentName).toContain('Passbook');
    });

    it('filters documents by status "In Custody" with summary counts', async () => {
      const res = await request(app)
        .get('/api/v1/docs-in-out?status=In Custody')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data.every((d: any) => d.status === 'In Custody')).toBe(
        true
      );
      expect(res.body.data.summary.inCustody).toBeGreaterThanOrEqual(2);
      expect(res.body.data.summary.returned).toBeGreaterThanOrEqual(1);
    });

    it('returns aggregated storage locations with active custody counts', async () => {
      const res = await request(app)
        .get('/api/v1/docs-in-out/locations')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      const safeLoc = res.body.data.find(
        (l: any) => l.location === 'Fireproof Safe 2, Shelf D-4'
      );
      expect(safeLoc).toBeDefined();
      expect(safeLoc.activeCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Phase 84: Return Acknowledgment & Overdue Alerts ────────────
  describe('Phase 84: Return Acknowledgment & Automated Overdue Scanner', () => {
    it('acknowledges and marks physical document as returned', async () => {
      const res = await request(app)
        .post(`/api/v1/docs-in-out/${testDocReturnableId}/return`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          returnedToPersonName: 'Sunil Mehta (Director)',
          returnedNotes: 'Returned in original condition after audit signoff'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Returned');
      expect(res.body.data.actualReturnedDate).toBeDefined();
      expect(res.body.data.returnedToPersonName).toBe('Sunil Mehta (Director)');
      expect(res.body.data.returnedNotes).toBe(
        'Returned in original condition after audit signoff'
      );
    });

    it('rejects duplicate return on an already returned document with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/docs-in-out/${testDocReturnableId}/return`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          returnedToPersonName: 'Sunil Mehta'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DOCUMENT_ALREADY_RETURNED');
    });

    it('identifies overdue returnable items via automated overdue scanner', async () => {
      // Create a document that had a past expected return date
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const overdueDoc = await PhysicalDocumentModel.create({
        tenantId: orgAId,
        clientId: new mongoose.Types.ObjectId(clientAId),
        category: 'Received',
        documentType: 'Cheque Book',
        documentName: 'Signed Blank Security Cheque Leaf #445566',
        location: 'Safe Drawer 2',
        isReturnable: true,
        returnDate: pastDate,
        status: 'In Custody',
        custodianUserId: userAId
      });
      testDocOverdueId = overdueDoc._id.toString();

      // Trigger overdue scanner
      const scanRes = await request(app)
        .post('/api/v1/docs-in-out/trigger-scan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({});

      expect(scanRes.status).toBe(200);
      expect(scanRes.body.success).toBe(true);
      expect(scanRes.body.data.updatedOverdueCount).toBeGreaterThanOrEqual(1);

      // Verify status transitioned to 'Overdue'
      const checkRes = await request(app)
        .get(`/api/v1/docs-in-out/${testDocOverdueId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(checkRes.status).toBe(200);
      expect(checkRes.body.data.status).toBe('Overdue');
    });
  });

  // ─── Phase 85: Document Register Export & Handover Slips ────────
  describe('Phase 85: CSV Audit Export & Printable Handover Slips', () => {
    it('exports physical documents register to text/csv with formatted rows', async () => {
      const res = await request(app)
        .get('/api/v1/docs-in-out/export')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(
        'attachment; filename="docs-in-out-register.csv"'
      );

      const csvContent = res.text;
      expect(csvContent).toContain('Date,Category,Document Name,Document Type');
      expect(csvContent).toContain('Original Title Deed - Bandra Commercial Complex');
      expect(csvContent).toContain('Horizon Infra Tech Pvt Ltd');
    });

    it('generates structured handover slip JSON payload with client & firm metadata', async () => {
      const res = await request(app)
        .get(`/api/v1/docs-in-out/${testDoc1Id}/handover-slip`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organization.name).toBe('Apex Advisory Services LLP');
      expect(res.body.data.client.name).toBe('Horizon Infra Tech Pvt Ltd');
      expect(res.body.data.document.name).toBe(
        'Original Title Deed - Bandra Commercial Complex'
      );
      expect(res.body.data.html).toBeDefined();
    });

    it('renders printable HTML handover acknowledgment slip when format=html is requested', async () => {
      const res = await request(app)
        .get(`/api/v1/docs-in-out/${testDoc1Id}/handover-slip?format=html`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('Document Handover Acknowledgment Slip');
      expect(res.text).toContain('Apex Advisory Services LLP');
      expect(res.text).toContain('Authorized Signatory');
      expect(res.text).toContain('Client Signature');
    });
  });

  // ─── Multi-Tenant Isolation & Role Authorization ────────────────
  describe('Security: Multi-Tenant Isolation & Role Access Control', () => {
    it('blocks unauthorized staff without docsInOut permission (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/docs-in-out')
        .set('Authorization', `Bearer ${tokenStaffRestricted}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('prevents cross-tenant access: Tenant B cannot view Tenant A documents (404 Not Found)', async () => {
      const res = await request(app)
        .get(`/api/v1/docs-in-out/${testDoc1Id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    });

    it('prevents cross-tenant return acknowledgment: Tenant B cannot return Tenant A documents', async () => {
      const res = await request(app)
        .post(`/api/v1/docs-in-out/${testDoc1Id}/return`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          returnedToPersonName: 'Intruder'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    });
  });
});
