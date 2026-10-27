import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { Task } from '../models/Task';
import { DocumentRequest } from '../models/DocumentRequest';
import { DocumentModel } from '../models/Document';
import { TaskHistory } from '../models/TaskHistory';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 18: One-Click Client Document Request & Public Upload Engine (Phases 86–90)', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let userAId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;
  let tokenStaffRestricted: string;
  let clientAId: string;
  let clientBId: string;
  let taskId: string;
  let docRequestId: string;
  let publicToken: string;
  let item1Id: string;
  let item2Id: string;
  let expiredDocRequestId: string;
  let expiredPublicToken: string;

  const orgASlug = 'docreq-orga-p86';
  const orgBSlug = 'docreq-orgb-p86';
  const userAEmail = 'admina.docreq86@example.com';
  const userBEmail = 'adminb.docreq86@example.com';
  const staffRestrictedEmail = 'staff.restricted86@example.com';

  beforeAll(async () => {
    await connectDB();

    // Clean up stale data
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [userAEmail, userBEmail, staffRestrictedEmail] }
    }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({
      name: 'Pinnacle Advisory LLP',
      slug: orgASlug,
      lastDocumentRequestNumber: 0,
      address: {
        addressLine1: '901 Corporate One',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        pincode: '400072'
      }
    });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const superAdminRoleA = await Role.create({
      tenantId: orgAId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    const restrictedRole = await Role.create({
      tenantId: orgAId,
      name: 'Restricted Staff',
      isSuperAdmin: false,
      permissions: {
        client: {
          create: { allowed: false, scope: 'everything' },
          edit: { allowed: false, scope: 'everything' },
          view: { allowed: false, scope: 'everything' },
          delete: { allowed: false, scope: 'everything' },
          viewLedger: { allowed: false, scope: 'everything' },
          manageClientPackages: { allowed: false, scope: 'everything' },
          viewClientPackages: { allowed: false, scope: 'everything' }
        }
      }
    });

    const userA = await User.create({
      tenantId: orgAId,
      name: 'Nitin Shah (Partner)',
      username: 'nitin_docreq86',
      email: userAEmail,
      password: 'password123',
      roleId: superAdminRoleA._id
    });
    userAId = userA._id as mongoose.Types.ObjectId;

    await User.create({
      tenantId: orgAId,
      name: 'Trainee Joy',
      username: 'joy_docreq86',
      email: staffRestrictedEmail,
      password: 'password123',
      roleId: restrictedRole._id
    });

    const loginResA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userAEmail, password: 'password123' });
    tokenA = loginResA.body.data.accessToken;

    const loginResRestricted = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: staffRestrictedEmail, password: 'password123' });
    tokenStaffRestricted = loginResRestricted.body.data.accessToken;

    const clientA = await Client.create({
      tenantId: orgAId,
      name: 'Zenith Logistics Ltd',
      email: 'client@zenithlogistics.com',
      mobile: '9833445566',
      pan: 'ABCDE9988Z',
      entityType: 'Private Limited'
    });
    clientAId = clientA._id.toString();

    // Create an associated Task
    const task = await Task.create({
      tenantId: orgAId,
      clientId: clientA._id,
      serviceId: new mongoose.Types.ObjectId(),
      assigneeIds: [userAId],
      description: 'Q3 GST Return Filing',
      status: 'In Progress',
      priority: 'High',
      creationType: 'manual'
    });
    taskId = task._id.toString();

    // Setup Org B for isolation tests
    const orgB = await Organization.create({
      name: 'Alpha Corporate Services',
      slug: orgBSlug,
      lastDocumentRequestNumber: 0
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
      name: 'Neha Kapoor',
      username: 'neha_docreq86',
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
      name: 'Sigma Retailers',
      email: 'sigma@example.com',
      mobile: '9877112233',
      entityType: 'Partnership Firm'
    });
    clientBId = clientB._id.toString();
  });

  afterAll(async () => {
    await DocumentRequest.deleteMany({
      tenantId: { $in: [orgAId, orgBId] }
    });
    await DocumentModel.deleteMany({
      tenantId: { $in: [orgAId, orgBId] }
    });
    await TaskHistory.deleteMany({
      tenantId: { $in: [orgAId, orgBId] }
    });
    await Task.deleteMany({ tenantId: { $in: [orgAId, orgBId] } });
    await Client.deleteMany({ tenantId: { $in: [orgAId, orgBId] } });
    await User.deleteMany({
      tenantId: { $in: [orgAId, orgBId] }
    }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } });
    await Organization.deleteMany({ _id: { $in: [orgAId, orgBId] } });
  });

  // ─── Phase 86 & 87: Document Request Creation & Magic Link Dispatch ───
  describe('Phase 86 & 87: Document Request Creation & Cryptographic Magic Links', () => {
    it('rejects document request creation with empty items list', async () => {
      const res = await request(app)
        .post('/api/v1/document-requests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          title: 'Year-End Audit Documents',
          items: []
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('creates a multi-item document request with 64-char crypto token and upload URL', async () => {
      const res = await request(app)
        .post('/api/v1/document-requests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          taskId,
          title: 'Q3 Statutory Audit & GST Inward Registers',
          instructions: 'Please upload signed GSTR-2B statement and bank statement in PDF or Excel.',
          expiresInDays: 7,
          items: [
            {
              name: 'GSTR-2B Summary Statement',
              description: 'Official Excel/PDF export from GST portal',
              isRequired: true,
              acceptedFormats: ['.pdf', '.xlsx', '.csv']
            },
            {
              name: 'HDFC Bank Statement Q3',
              description: 'Oct to Dec 2025 bank transaction records',
              isRequired: true,
              acceptedFormats: ['.pdf']
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBeDefined();
      expect(res.body.data.requestNo).toMatch(/^DREQ-\d+$/);
      expect(res.body.data.token).toHaveLength(64);
      expect(res.body.data.status).toBe('Pending');
      expect(res.body.data.uploadUrl).toContain(`/public/upload/${res.body.data.token}`);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0].status).toBe('Pending');

      docRequestId = res.body.data._id;
      publicToken = res.body.data.token;
      item1Id = res.body.data.items[0]._id;
      item2Id = res.body.data.items[1]._id;
    });
  });

  // ─── Phase 88: Public Non-Authenticated Upload API ──────────────
  describe('Phase 88: Public Non-Authenticated Upload API', () => {
    it('publicly resolves document request checklist without authentication', async () => {
      const res = await request(app).get(
        `/api/v1/public/document-requests/${publicToken}`
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe(
        'Q3 Statutory Audit & GST Inward Registers'
      );
      expect(res.body.data.firm.name).toBe('Pinnacle Advisory LLP');
      expect(res.body.data.client.name).toBe('Zenith Logistics Ltd');
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0]._id).toBe(item1Id);
    });

    it('rejects upload of forbidden executable file (.exe) with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/public/document-requests/${publicToken}/upload`)
        .field('itemId', item1Id)
        .attach(
          'file',
          Buffer.from('MALICIOUS_EXEC_PAYLOAD'),
          'payload.exe'
        );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_FILE_TYPE');
    });

    it('rejects upload of file format not in acceptedFormats (.png when only .pdf/.xlsx allowed)', async () => {
      const res = await request(app)
        .post(`/api/v1/public/document-requests/${publicToken}/upload`)
        .field('itemId', item2Id) // item2 only accepts ['.pdf']
        .attach(
          'file',
          Buffer.from('IMAGE_CONTENT'),
          'statement.png'
        );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    });

    it('successfully uploads valid file for item 1, transitioning status to "Partially Uploaded"', async () => {
      const res = await request(app)
        .post(`/api/v1/public/document-requests/${publicToken}/upload`)
        .field('itemId', item1Id)
        .attach(
          'file',
          Buffer.from('PDF_SAMPLE_GSTR2B_CONTENT'),
          'gstr2b_oct_dec.pdf'
        );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Partially Uploaded');
      expect(res.body.data.item.status).toBe('Uploaded');
      expect(res.body.data.progress.uploaded).toBe(1);
      expect(res.body.data.progress.total).toBe(2);
      expect(res.body.data.progress.isFullyCompleted).toBe(false);
    });

    it('successfully uploads remaining file for item 2, transitioning request to "Completed"', async () => {
      const res = await request(app)
        .post(`/api/v1/public/document-requests/${publicToken}/upload`)
        .field('itemId', item2Id)
        .attach(
          'file',
          Buffer.from('PDF_BANK_STATEMENT_CONTENT'),
          'hdfc_bank_statement.pdf'
        );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Completed');
      expect(res.body.data.progress.uploaded).toBe(2);
      expect(res.body.data.progress.isFullyCompleted).toBe(true);
    });
  });

  // ─── Phase 89: Storage Linkage & Task Auto-Notification ─────────
  describe('Phase 89: Internal Vault Storage & Task Audit Trail', () => {
    it('verifies uploaded file created an internal Document vault record', async () => {
      const documents = await DocumentModel.find({
        tenantId: orgAId,
        clientId: new mongoose.Types.ObjectId(clientAId),
        taskId: new mongoose.Types.ObjectId(taskId)
      });

      expect(documents.length).toBeGreaterThanOrEqual(2);
      expect(documents.some((d) => d.fileName === 'gstr2b_oct_dec.pdf')).toBe(true);
      expect(documents.some((d) => d.fileName === 'hdfc_bank_statement.pdf')).toBe(true);
    });

    it('verifies automated TaskHistory entry was created for the associated task', async () => {
      const historyEntries = await TaskHistory.find({
        tenantId: orgAId,
        taskId: new mongoose.Types.ObjectId(taskId)
      });

      expect(historyEntries.length).toBeGreaterThanOrEqual(2);
      expect(
        historyEntries.some((h) => h.details?.includes('gstr2b_oct_dec.pdf'))
      ).toBe(true);
      expect(
        historyEntries.some((h) => h.details?.includes('hdfc_bank_statement.pdf'))
      ).toBe(true);
    });
  });

  // ─── Phase 90: Request Lifecycle, Oversight & Expiry Enforcement ──
  describe('Phase 90: Request Oversight, Resend, Cancel & Expiry Scan', () => {
    it('staff lists document requests with progress percentage and summary counts', async () => {
      const res = await request(app)
        .get('/api/v1/document-requests')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(1);

      const target = res.body.data.data.find((r: any) => r._id === docRequestId);
      expect(target).toBeDefined();
      expect(target.progress.progressPercentage).toBe(100);
      expect(target.status).toBe('Completed');
      expect(res.body.data.summary.completed).toBeGreaterThanOrEqual(1);
    });

    it('staff retrieves single document request by ID with populated references', async () => {
      const res = await request(app)
        .get(`/api/v1/document-requests/${docRequestId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(docRequestId);
      expect(res.body.data.clientId.name).toBe('Zenith Logistics Ltd');
      expect(res.body.data.taskId.description).toBe('Q3 GST Return Filing');
      expect(res.body.data.items[0].uploadedDocumentId.fileName).toBe(
        'gstr2b_oct_dec.pdf'
      );
    });

    it('staff resends document request reminder to client', async () => {
      const res = await request(app)
        .post(`/api/v1/document-requests/${docRequestId}/resend`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.emailSentTo).toBe('client@zenithlogistics.com');
      expect(res.body.data.uploadUrl).toBeDefined();
    });

    it('staff cancels document request, immediately invalidating the public token', async () => {
      const res = await request(app)
        .delete(`/api/v1/document-requests/${docRequestId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Cancelled');

      // Verify public portal rejects access for cancelled request
      const publicRes = await request(app).get(
        `/api/v1/public/document-requests/${publicToken}`
      );
      expect(publicRes.status).toBe(400);
      expect(publicRes.body.error.code).toBe('DOCUMENT_REQUEST_CANCELLED');
    });

    it('background expiry scan marks past-due document requests as "Expired"', async () => {
      // Create past-due request
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 3);

      const expiredReq = await DocumentRequest.create({
        tenantId: orgAId,
        clientId: new mongoose.Types.ObjectId(clientAId),
        requestNo: 'DREQ-PAST',
        title: 'Past Expired Request',
        token: 'a'.repeat(64),
        items: [{ name: 'Overdue Certificate', isRequired: true, status: 'Pending' }],
        expiresAt: pastDate,
        status: 'Pending',
        createdBy: userAId
      });
      expiredDocRequestId = expiredReq._id.toString();
      expiredPublicToken = expiredReq.token;

      // Trigger expiry scan
      const scanRes = await request(app)
        .post('/api/v1/document-requests/trigger-scan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({});

      expect(scanRes.status).toBe(200);
      expect(scanRes.body.success).toBe(true);
      expect(scanRes.body.data.updatedExpiredCount).toBeGreaterThanOrEqual(1);

      // Verify public portal returns 410 Gone for expired token
      const publicRes = await request(app).get(
        `/api/v1/public/document-requests/${expiredPublicToken}`
      );
      expect(publicRes.status).toBe(410);
      expect(publicRes.body.error.code).toBe('DOCUMENT_REQUEST_EXPIRED');
    });
  });

  // ─── Multi-Tenant Isolation & Security ──────────────────────────
  describe('Security & Multi-Tenant Isolation', () => {
    it('blocks staff without client permissions from accessing document requests (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/document-requests')
        .set('Authorization', `Bearer ${tokenStaffRestricted}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('prevents cross-tenant access: Tenant B cannot view Tenant A document requests (404 Not Found)', async () => {
      const res = await request(app)
        .get(`/api/v1/document-requests/${docRequestId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('REQUEST_NOT_FOUND');
    });

    it('prevents cross-tenant cancellation: Tenant B cannot cancel Tenant A document requests', async () => {
      const res = await request(app)
        .delete(`/api/v1/document-requests/${docRequestId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('REQUEST_NOT_FOUND');
    });
  });
});
