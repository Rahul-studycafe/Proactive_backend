import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { DSC } from '../models/DSC';
import { DSCHandoverLog } from '../models/DSCHandoverLog';
import { Task } from '../models/Task';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 15: Digital Signature Certificate (DSC) Management & Expiry Automation (Phases 71–75)', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;
  let clientAId: string;
  let clientBId: string;
  let createdDscId: string;

  const orgASlug = 'dsc-orga-p71';
  const orgBSlug = 'dsc-orgb-p71';
  const userAEmail = 'adminA.dsc71@example.com';
  const userBEmail = 'adminB.dsc71@example.com';

  beforeAll(async () => {
    await connectDB();

    // Clean up any stale records
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({ name: 'DSC Org A', slug: orgASlug });
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
      username: 'admin_a_dsc71',
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
      name: 'Reliance Infocomm Test Client',
      email: 'clientA@example.com',
      mobile: '9876543210',
      pan: 'ABCDE1234F',
      gstin: '27ABCDE1234F1Z5',
      entityType: 'Private Limited'
    });
    clientAId = clientA._id.toString();

    // Setup Org B for tenant isolation
    const orgB = await Organization.create({ name: 'DSC Org B', slug: orgBSlug });
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
      username: 'admin_b_dsc71',
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
      name: 'Org B Test Client',
      email: 'clientB@example.com',
      mobile: '9876543211',
      pan: 'BCDEF2345G',
      gstin: '27BCDEF2345G1Z5',
      entityType: 'LLP'
    });
    clientBId = clientB._id.toString();
  });

  afterAll(async () => {
    if (orgAId) {
      await DSC.deleteMany({ tenantId: orgAId });
      await DSCHandoverLog.deleteMany({ tenantId: orgAId });
      await Task.deleteMany({ tenantId: orgAId });
      await Client.deleteMany({ tenantId: orgAId });
      await User.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
      await Role.deleteMany({ tenantId: orgAId });
      await Organization.deleteOne({ _id: orgAId });
    }
    if (orgBId) {
      await DSC.deleteMany({ tenantId: orgBId });
      await DSCHandoverLog.deleteMany({ tenantId: orgBId });
      await Task.deleteMany({ tenantId: orgBId });
      await Client.deleteMany({ tenantId: orgBId });
      await User.deleteMany({ tenantId: orgBId }).setOptions({ skipTenantPlugin: true });
      await Role.deleteMany({ tenantId: orgBId });
      await Organization.deleteOne({ _id: orgBId });
    }
    await mongoose.connection.close();
  });

  // ─── Phase 71: DSC Model & Registration ─────────────────────────────
  describe('Phase 71: DSC Model & Registration API', () => {
    it('creates a new DSC token record with valid metadata and default status "In Office"', async () => {
      const issueDate = new Date();
      const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year later

      const res = await request(app)
        .post('/api/v1/dsc')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          certificateName: 'Mukesh Ambani - Director Class 3',
          certificateClass: 'Class 3',
          tokenType: 'ePass2003',
          tokenSerialNumber: 'EP2003-998877',
          issuingAuthority: 'eMudhra',
          issueDate: issueDate.toISOString(),
          expiryDate: expiryDate.toISOString(),
          physicalLocation: 'Fireproof Safe 1, Slot D-12',
          notes: 'Director DSC for ROC annual filing'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.certificateName).toBe('Mukesh Ambani - Director Class 3');
      expect(res.body.data.status).toBe('In Office');
      expect(res.body.data.physicalLocation).toBe('Fireproof Safe 1, Slot D-12');
      expect(res.body.data.tokenSerialNumber).toBe('EP2003-998877');

      createdDscId = res.body.data._id;
    });

    it('rejects registration if expiry date is earlier than or equal to issue date', async () => {
      const issueDate = new Date();
      const invalidExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/v1/dsc')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          certificateName: 'Invalid Date DSC',
          issueDate: issueDate.toISOString(),
          expiryDate: invalidExpiry.toISOString(),
          physicalLocation: 'Cabinet B'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_EXPIRY_DATE');
    });

    it('rejects registration if client belongs to a different organization', async () => {
      const res = await request(app)
        .post('/api/v1/dsc')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientBId, // Belongs to Org B
          certificateName: 'Cross-Tenant DSC',
          issueDate: new Date().toISOString(),
          expiryDate: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString(),
          physicalLocation: 'Cabinet B'
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CLIENT_NOT_FOUND');
    });
  });

  // ─── Phase 72: DSC Inventory CRUD & Directory APIs ──────────────────
  describe('Phase 72: DSC Inventory CRUD & Directory APIs', () => {
    it('retrieves paginated DSC inventory with populated client and creator details', async () => {
      const res = await request(app)
        .get('/api/v1/dsc')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.dscs)).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.dscs[0].clientId.name).toBe('Reliance Infocomm Test Client');
    });

    it('filters DSC inventory by search term matching certificate name or serial', async () => {
      const res = await request(app)
        .get('/api/v1/dsc?search=EP2003-998877')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.dscs.length).toBe(1);
      expect(res.body.data.dscs[0]._id).toBe(createdDscId);
    });

    it('fetches a single DSC by ID with populated history', async () => {
      const res = await request(app)
        .get(`/api/v1/dsc/${createdDscId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dsc._id).toBe(createdDscId);
      expect(Array.isArray(res.body.data.history)).toBe(true);
    });

    it('updates DSC physical location and notes', async () => {
      const res = await request(app)
        .put(`/api/v1/dsc/${createdDscId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          physicalLocation: 'Relocated to Safe Box 2, Slot E-01',
          notes: 'Updated shelf position after audit'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.physicalLocation).toBe('Relocated to Safe Box 2, Slot E-01');
      expect(res.body.data.notes).toBe('Updated shelf position after audit');
    });

    it('enforces multi-tenant isolation: Org B cannot view Org A DSC', async () => {
      const res = await request(app)
        .get(`/api/v1/dsc/${createdDscId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DSC_NOT_FOUND');
    });
  });

  // ─── Phase 73: DSC Physical Handover & Custody Tracking ─────────────
  describe('Phase 73: Physical Handover & Custody Log', () => {
    it('logs token handover to client and automatically transitions status to "With Client"', async () => {
      const res = await request(app)
        .post(`/api/v1/dsc/${createdDscId}/handover`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          action: 'Handed to Client',
          transferredToName: 'Anil Ambani (Representative)',
          transferredToPhone: '9822001122',
          reason: 'Required for personal banking authorization',
          expectedReturnDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          notes: 'Signed physical receipt on departure'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.log.action).toBe('Handed to Client');
      expect(res.body.data.dsc.status).toBe('With Client');
      expect(res.body.data.dsc.currentHolderName).toBe('Anil Ambani (Representative)');
    });

    it('logs token return from client and automatically resets status to "In Office"', async () => {
      const res = await request(app)
        .post(`/api/v1/dsc/${createdDscId}/handover`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          action: 'Received from Client',
          transferredToName: 'Admin A',
          reason: 'Returned back to office custody',
          receivedBackDate: new Date().toISOString()
        });

      expect(res.status).toBe(201);
      expect(res.body.data.dsc.status).toBe('In Office');
      expect(res.body.data.dsc.currentHolderName).toBeUndefined();
    });

    it('retrieves full chronological movement audit history for the DSC token', async () => {
      const res = await request(app)
        .get(`/api/v1/dsc/${createdDscId}/history`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].action).toBe('Received from Client');
      expect(res.body.data[1].action).toBe('Handed to Client');
    });
  });

  // ─── Phase 74 & 75: Expiry Scanner, Task Generation & Alerts ─────────
  describe('Phase 74 & 75: Automated Expiry Scanner, Tasks & Client Alerts', () => {
    let dsc30DayId: string;
    let dsc7DayId: string;
    let dscExpiredId: string;

    beforeAll(async () => {
      const now = new Date();

      // DSC 1: Expiring in 20 days (matches 30-day window)
      const dsc30 = await DSC.create({
        tenantId: orgAId,
        clientId: clientAId,
        certificateName: 'Test DSC 20 Days',
        certificateClass: 'Class 3',
        tokenType: 'mToken',
        tokenSerialNumber: 'MT-30D',
        issuingAuthority: 'Vsign',
        issueDate: new Date(now.getTime() - 340 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000),
        physicalLocation: 'Safe Box 3, Slot 1',
        status: 'In Office',
        createdBy: new mongoose.Types.ObjectId()
      });
      dsc30DayId = dsc30._id.toString();

      // DSC 2: Expiring in 4 days (matches 7-day urgent window)
      const dsc7 = await DSC.create({
        tenantId: orgAId,
        clientId: clientAId,
        certificateName: 'Test DSC 4 Days Urgent',
        certificateClass: 'Class 3',
        tokenType: 'ProxKey',
        tokenSerialNumber: 'PK-7D',
        issuingAuthority: 'Capricorn',
        issueDate: new Date(now.getTime() - 360 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
        physicalLocation: 'Safe Box 3, Slot 2',
        status: 'In Office',
        createdBy: new mongoose.Types.ObjectId()
      });
      dsc7DayId = dsc7._id.toString();

      // DSC 3: Expired 2 days ago
      const dscExp = await DSC.create({
        tenantId: orgAId,
        clientId: clientAId,
        certificateName: 'Test DSC Already Expired',
        certificateClass: 'Class 2',
        tokenType: 'ePass2003',
        tokenSerialNumber: 'EP-EXPIRED',
        issuingAuthority: 'eMudhra',
        issueDate: new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        physicalLocation: 'Archive Drawer 9',
        status: 'In Office',
        createdBy: new mongoose.Types.ObjectId()
      });
      dscExpiredId = dscExp._id.toString();
    });

    it('triggers DSC expiry scan and detects milestones, marks expired, and spawns renewal tasks', async () => {
      const res = await request(app)
        .post('/api/v1/dsc/trigger-scan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.scannedCount).toBeGreaterThanOrEqual(3);
      expect(res.body.data.expiredCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.milestonesTriggered.sevenDays).toBeGreaterThanOrEqual(1);
      expect(res.body.data.milestonesTriggered.thirtyDays).toBeGreaterThanOrEqual(1);
      expect(res.body.data.tasksCreated).toBeGreaterThanOrEqual(1);

      // Verify already expired token status was updated
      const expiredDsc = await DSC.findById(dscExpiredId);
      expect(expiredDsc?.status).toBe('Expired');

      // Verify 7-day token milestone recorded
      const urgentDsc = await DSC.findById(dsc7DayId);
      expect(urgentDsc?.alertMilestonesSent).toContain('7_day');

      // Verify 30-day token milestone recorded
      const thirtyDsc = await DSC.findById(dsc30DayId);
      expect(thirtyDsc?.alertMilestonesSent).toContain('30_day');
    });

    it('verifies auto-spawned renewal task in Task collection with Urgent priority and checklist', async () => {
      const renewalTask = await Task.findOne({
        tenantId: orgAId,
        description: /Test DSC 4 Days Urgent/
      });

      expect(renewalTask).toBeDefined();
      expect(renewalTask?.priority).toBe('Urgent');
      expect(renewalTask?.creationType).toBe('automated');
      expect(renewalTask?.checklist.length).toBe(4);
      expect(renewalTask?.checklist[0].stepName).toContain('Contact Client for Renewal');
    });

    it('guarantees idempotency: re-running scan does not generate duplicate tasks or duplicate milestone alerts', async () => {
      const resSecondRun = await request(app)
        .post('/api/v1/dsc/trigger-scan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({});

      expect(resSecondRun.status).toBe(200);
      // Because milestones were already sent, 0 new milestones should be triggered
      expect(resSecondRun.body.data.milestonesTriggered.sevenDays).toBe(0);
      expect(resSecondRun.body.data.milestonesTriggered.thirtyDays).toBe(0);
      expect(resSecondRun.body.data.tasksCreated).toBe(0);
    });

    it('retrieves live DSC KPI summary metrics for dashboard integration', async () => {
      const res = await request(app)
        .get('/api/v1/dsc/kpi')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(4);
      expect(res.body.data.inOffice).toBeGreaterThanOrEqual(2);
      expect(res.body.data.expired).toBeGreaterThanOrEqual(1);
      expect(res.body.data.expiringIn30Days).toBeGreaterThanOrEqual(2);
    });
  });
});
