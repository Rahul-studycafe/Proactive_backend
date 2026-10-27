import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { ComplianceLog } from '../models/ComplianceLog';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 19: External Compliance Verification: GSTIN & PAN APIs (Phases 91–95)', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let userAId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;
  let tokenStaffRestricted: string;
  let clientAId: string;
  let clientBId: string;

  const orgASlug = 'comp-orga-p91';
  const orgBSlug = 'comp-orgb-p91';
  const userAEmail = 'admina.comp91@example.com';
  const userBEmail = 'adminb.comp91@example.com';
  const staffRestrictedEmail = 'staff.restricted91@example.com';

  const validCompanyPan = 'AABCA1234C';
  const validIndividualPan = 'ABCPS5678P';
  const validLlpPan = 'AABFA9876F';
  const validGstin = '27AABCA1234C1Z5';
  const cancelledGstin = '27AABCA1234C1Z9';

  beforeAll(async () => {
    await connectDB();

    // Clean up test data
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [userAEmail, userBEmail, staffRestrictedEmail] }
    }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({
      name: 'Vanguard Tax Advisory LLP',
      slug: orgASlug
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
      name: 'Prakash Rao (Partner)',
      username: 'prakash_comp91',
      email: userAEmail,
      password: 'password123',
      roleId: superAdminRoleA._id
    });
    userAId = userA._id as mongoose.Types.ObjectId;

    await User.create({
      tenantId: orgAId,
      name: 'Junior Clerk',
      username: 'clerk_comp91',
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

    // Create client in Org A with unverified PAN & GSTIN
    const clientA = await Client.create({
      tenantId: orgAId,
      name: 'Apex Industrial Corporation',
      email: 'finance@apexindustrial.com',
      mobile: '9820011999',
      pan: validCompanyPan,
      gstin: validGstin,
      entityType: 'Private Limited',
      panVerified: false,
      gstinVerified: false
    });
    clientAId = clientA._id.toString();

    // Setup Org B for tenant isolation testing
    const orgB = await Organization.create({
      name: 'Omega Consulting Services',
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
      name: 'Kavita Menon',
      username: 'kavita_comp91',
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
      name: 'Beacon Enterprises',
      email: 'beacon@example.com',
      mobile: '9911223344',
      entityType: 'Partnership Firm'
    });
    clientBId = clientB._id.toString();
  });

  afterAll(async () => {
    await ComplianceLog.deleteMany({
      tenantId: { $in: [orgAId, orgBId] }
    });
    await Client.deleteMany({ tenantId: { $in: [orgAId, orgBId] } });
    await User.deleteMany({
      tenantId: { $in: [orgAId, orgBId] }
    }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } });
    await Organization.deleteMany({ _id: { $in: [orgAId, orgBId] } });
  });

  // ─── Phase 91 & 92: PAN Verification & Algorithmic Validation ────
  describe('Phase 91 & 92: PAN Algorithmic Validation & Verification Engine', () => {
    it('rejects invalid PAN format (less than 10 chars or invalid characters) with 400', async () => {
      const res = await request(app)
        .post('/api/v1/compliance/verify-pan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ pan: 'INVALID12' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('verifies Company PAN, derives category "Company", and returns active status', async () => {
      const res = await request(app)
        .post('/api/v1/compliance/verify-pan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ pan: validCompanyPan });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pan).toBe(validCompanyPan);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.category).toBe('Company');
      expect(res.body.data.status).toBe('Active');
      expect(res.body.data.nameOnPan).toContain('Solutions Private Limited');
    });

    it('verifies Individual PAN and correctly derives category "Individual"', async () => {
      const res = await request(app)
        .post('/api/v1/compliance/verify-pan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ pan: validIndividualPan });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.category).toBe('Individual');
      expect(res.body.data.status).toBe('Active');
      expect(res.body.data.nameOnPan).toContain('Sharma');
    });

    it('verifies Partnership / LLP PAN and correctly derives category "Partnership / LLP"', async () => {
      const res = await request(app)
        .post('/api/v1/compliance/verify-pan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ pan: validLlpPan });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.category).toBe('Partnership / LLP');
      expect(res.body.data.status).toBe('Active');
    });

    it('handles simulated non-existent PAN returning status "NotFound"', async () => {
      const res = await request(app)
        .post('/api/v1/compliance/verify-pan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ pan: 'ZZZZZ0000X' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('NotFound');
      expect(res.body.data.valid).toBe(false);
    });

    it('handles simulated inactive PAN returning status "Inactive"', async () => {
      const res = await request(app)
        .post('/api/v1/compliance/verify-pan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ pan: 'ABCDE9999I' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Inactive');
    });
  });

  // ─── Phase 93: GSTIN Public Verification & Search API ────────────
  describe('Phase 93: GSTIN Public Verification & Search API', () => {
    it('rejects malformed GSTIN syntax with 400', async () => {
      const res = await request(app)
        .post('/api/v1/compliance/verify-gstin')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gstin: 'SHORT_GSTIN' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects GSTIN with invalid Indian state code prefix', async () => {
      // 00 is not a valid Indian GST state code
      const res = await request(app)
        .post('/api/v1/compliance/verify-gstin')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gstin: '00AABCA1234C1Z5' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_GSTIN_FORMAT');
    });

    it('successfully validates 15-digit GSTIN, extracts state name, embedded PAN, and profile', async () => {
      const res = await request(app)
        .post('/api/v1/compliance/verify-gstin')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gstin: validGstin });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.gstin).toBe(validGstin);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.pan).toBe('AABCA1234C');
      expect(res.body.data.principalAddress.state).toBe('Maharashtra');
      expect(res.body.data.legalName).toBe('Acme Solutions Private Limited');
      expect(res.body.data.status).toBe('Active');
    });

    it('handles cancelled GSTIN returning status "Cancelled"', async () => {
      const res = await request(app)
        .post('/api/v1/compliance/verify-gstin')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gstin: cancelledGstin });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Cancelled');
    });
  });

  // ─── Phase 94: 1-Click Client Onboarding Auto-Fill Integration ───
  describe('Phase 94: 1-Click Client Onboarding Auto-Fill Integration', () => {
    it('auto-fills client creation payload from verified GSTIN via /api/v1/clients/auto-fill-from-gstin', async () => {
      const res = await request(app)
        .post('/api/v1/clients/auto-fill-from-gstin')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gstin: validGstin });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Acme Solutions Private Limited');
      expect(res.body.data.pan).toBe('AABCA1234C');
      expect(res.body.data.gstin).toBe(validGstin);
      expect(res.body.data.entityType).toBe('Private Limited');
      expect(res.body.data.state).toBe('Maharashtra');
      expect(res.body.data.city).toBe('Mumbai');
      expect(res.body.data.pincode).toBe('400051');
    });

    it('also responds via compliance alias endpoint /api/v1/compliance/auto-fill-client', async () => {
      const res = await request(app)
        .post('/api/v1/compliance/auto-fill-client')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gstin: validGstin });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.gstin).toBe(validGstin);
    });

    it('rejects auto-fill for cancelled or inactive GSTIN with 400', async () => {
      const res = await request(app)
        .post('/api/v1/clients/auto-fill-from-gstin')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gstin: cancelledGstin });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('GSTIN_INACTIVE');
    });
  });

  // ─── Phase 95: Verification Cache, Badges & Compliance Audit Log ─
  describe('Phase 95: 30-Day Cache, Verified Badge Persistence & Audit Log', () => {
    it('returns result directly from 30-day cache on subsequent PAN verification (fromCache: true)', async () => {
      const resSecond = await request(app)
        .post('/api/v1/compliance/verify-pan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ pan: validCompanyPan });

      expect(resSecond.status).toBe(200);
      expect(resSecond.body.success).toBe(true);
      expect(resSecond.body.data.fromCache).toBe(true);
    });

    it('returns result directly from 30-day cache on subsequent GSTIN verification (fromCache: true)', async () => {
      const resSecond = await request(app)
        .post('/api/v1/compliance/verify-gstin')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gstin: validGstin });

      expect(resSecond.status).toBe(200);
      expect(resSecond.body.success).toBe(true);
      expect(resSecond.body.data.fromCache).toBe(true);
    });

    it('automatically marks panVerified and gstinVerified badges on the matching Client record', async () => {
      const client = await Client.findById(clientAId);
      expect(client).toBeDefined();
      expect(client?.panVerified).toBe(true);
      expect(client?.gstinVerified).toBe(true);
      expect(client?.verifiedAt).toBeDefined();
    });

    it('retrieves compliance audit log stream with pagination and query filters', async () => {
      const res = await request(app)
        .get('/api/v1/compliance/logs')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(2);

      const panLog = res.body.data.data.find(
        (l: any) => l.queryValue === validCompanyPan
      );
      expect(panLog).toBeDefined();
      expect(panLog.queryType).toBe('PAN');
      expect(panLog.verifiedStatus).toBe('Active');
      expect(panLog.requestedBy.name).toBe('Prakash Rao (Partner)');
    });

    it('filters compliance logs by queryType=GSTIN', async () => {
      const res = await request(app)
        .get('/api/v1/compliance/logs?queryType=GSTIN')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data.every((l: any) => l.queryType === 'GSTIN')).toBe(
        true
      );
    });
  });

  // ─── Multi-Tenant Isolation & Role Authorization ────────────────
  describe('Security & Multi-Tenant Isolation', () => {
    it('blocks staff without client view permission from verifying PAN (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/compliance/verify-pan')
        .set('Authorization', `Bearer ${tokenStaffRestricted}`)
        .send({ pan: validCompanyPan });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks staff without client create permission from auto-filling GSTIN (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/clients/auto-fill-from-gstin')
        .set('Authorization', `Bearer ${tokenStaffRestricted}`)
        .send({ gstin: validGstin });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('prevents cross-tenant compliance cache access: Tenant B has isolated audit logs and separate cache', async () => {
      const resB = await request(app)
        .get('/api/v1/compliance/logs')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(resB.status).toBe(200);
      // Tenant B should have 0 logs since they have not run any verifications
      expect(resB.body.data.data.length).toBe(0);
    });
  });
});
