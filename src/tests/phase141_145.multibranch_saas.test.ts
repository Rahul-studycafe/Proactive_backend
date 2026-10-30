import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { Invoice } from '../models/Invoice';
import { BillingEntity } from '../models/BillingEntity';
import { TenantSubscription } from '../models/TenantSubscription';
import { TenantRenewalService } from '../services/tenant-renewal.service';

describe('Part 29 (Phases 141–145): Enterprise Multi-Branch Billing & SaaS Licensing Enforcement', () => {
  let tenantId: mongoose.Types.ObjectId;
  let staffToken: string;
  let roleId: mongoose.Types.ObjectId;
  let clientId: mongoose.Types.ObjectId;

  let otherTenantId: mongoose.Types.ObjectId;
  let otherStaffToken: string;

  let mumbaiEntityId: string;
  let bengaluruEntityId: string;

  beforeAll(async () => {
    await connectDB();

    tenantId = new mongoose.Types.ObjectId();
    otherTenantId = new mongoose.Types.ObjectId();
    roleId = new mongoose.Types.ObjectId();
    clientId = new mongoose.Types.ObjectId();

    const ts = Date.now();

    // Create Organizations with unique slugs
    await Organization.create([
      { _id: tenantId, name: 'National Chartered Group LLP', slug: `ncg-mb-${ts}`, isActive: true, lastInvoiceNumber: 0 },
      { _id: otherTenantId, name: 'Independent Advisory', slug: `indep-mb-${ts}`, isActive: true }
    ]);

    // Create Roles with super admin access
    const roleA = await Role.create({
      tenantId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });
    roleId = roleA._id as any;

    const roleB = await Role.create({
      tenantId: otherTenantId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    // Create Staff Users
    await User.create([
      {
        tenantId,
        name: 'Managing Partner',
        username: `partner_${ts}`,
        email: `partner.${ts}@ncg.com`,
        password: 'password123',
        roleId: roleA._id,
        isActive: true
      },
      {
        tenantId: otherTenantId,
        name: 'Other Partner',
        username: `other_p_${ts}`,
        email: `other.${ts}@indep.com`,
        password: 'password123',
        roleId: roleB._id,
        isActive: true
      }
    ]);

    // Authenticate to obtain JWT tokens
    const loginResA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `partner.${ts}@ncg.com`, password: 'password123' });
    staffToken = loginResA.body.data.accessToken;

    const loginResB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `other.${ts}@indep.com`, password: 'password123' });
    otherStaffToken = loginResB.body.data.accessToken;

    // Create Sample Client
    await Client.create({
      _id: clientId,
      tenantId,
      name: 'Reliance Digital Alpha',
      fileNo: `F-${ts}-RDA`,
      pan: 'ABCDE9999F',
      gstin: '27ABCDE9999F1Z9',
      entityType: 'Private Limited'
    });
  });

  afterAll(async () => {
    await Invoice.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await BillingEntity.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await TenantSubscription.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await Client.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await User.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await Role.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await Organization.deleteMany({ _id: { $in: [tenantId, otherTenantId] } });
    await mongoose.disconnect();
  });

  // ─── Phase 141: Multi-Branch & Billing Entity Schema ──────────────
  describe('Phase 141: Multi-Branch Billing Entity Management', () => {
    it('POST /api/v1/tenant-settings/billing-entities should create Mumbai branch entity', async () => {
      const res = await request(app)
        .post('/api/v1/tenant-settings/billing-entities')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          branchName: 'Mumbai Central Office',
          legalEntityName: 'National Chartered Group (West) LLP',
          gstin: '27AAACN1234F1Z1',
          stateCode: '27',
          invoicePrefix: 'INV-MUM-',
          contactEmail: 'mumbai@ncg.com',
          contactPhone: '9820098200',
          bankDetails: {
            bankName: 'HDFC Bank',
            accountNumber: '50200012345678',
            ifsc: 'HDFC0000123',
            branch: 'Nariman Point'
          },
          isDefault: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.branchName).toBe('Mumbai Central Office');
      expect(res.body.data.invoicePrefix).toBe('INV-MUM-');
      mumbaiEntityId = res.body.data._id;
    });

    it('POST /api/v1/tenant-settings/billing-entities should create Bengaluru branch entity', async () => {
      const res = await request(app)
        .post('/api/v1/tenant-settings/billing-entities')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          branchName: 'Bengaluru Tech Branch',
          legalEntityName: 'National Chartered Group (South) LLP',
          gstin: '29AAACN1234F1Z5',
          stateCode: '29',
          invoicePrefix: 'INV-BLR-',
          contactEmail: 'blr@ncg.com',
          contactPhone: '9845098450',
          bankDetails: {
            bankName: 'ICICI Bank',
            accountNumber: '000205123456',
            ifsc: 'ICIC0000002',
            branch: 'Indiranagar'
          },
          isDefault: false
        });

      expect(res.status).toBe(201);
      expect(res.body.data.invoicePrefix).toBe('INV-BLR-');
      bengaluruEntityId = res.body.data._id;
    });

    it('PUT /api/v1/tenant-settings/billing-entities/:id should update branch details', async () => {
      const res = await request(app)
        .put(`/api/v1/tenant-settings/billing-entities/${mumbaiEntityId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          contactPhone: '9820011111'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.contactPhone).toBe('9820011111');
    });

    it('GET /api/v1/tenant-settings/billing-entities should list all branch entities for tenant', async () => {
      const res = await request(app)
        .get('/api/v1/tenant-settings/billing-entities')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── Phase 142 & 143: Branch-Isolated Sequences & Invoicing ───────
  describe('Phase 142 & 143: Branch-Isolated Sequences & Cross-Branch Invoicing', () => {
    it('should generate independent sequence INV-MUM-001 for Mumbai invoice', async () => {
      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          clientId: clientId.toString(),
          billingEntityId: mumbaiEntityId,
          date: '2026-10-15',
          items: [
            {
              referenceType: 'Manual',
              particulars: 'Mumbai Audit Services',
              quantity: 1,
              rate: 50000,
              discount: 0,
              taxableAmount: 50000,
              gstPercentage: 18,
              gstAmount: 9000,
              total: 59000
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.invoiceNo).toBe('INV-MUM-001');
      expect(res.body.data.billingEntityId).toBe(mumbaiEntityId);
    });

    it('should generate independent sequence INV-BLR-001 for Bengaluru invoice', async () => {
      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          clientId: clientId.toString(),
          billingEntityId: bengaluruEntityId,
          date: '2026-10-16',
          items: [
            {
              referenceType: 'Manual',
              particulars: 'Bengaluru Tech Advisory',
              quantity: 1,
              rate: 30000,
              discount: 0,
              taxableAmount: 30000,
              gstPercentage: 18,
              gstAmount: 5400,
              total: 35400
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.invoiceNo).toBe('INV-BLR-001');
      expect(res.body.data.billingEntityId).toBe(bengaluruEntityId);
    });

    it('should increment Mumbai sequence to INV-MUM-002 while Bengaluru remains unaffected', async () => {
      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          clientId: clientId.toString(),
          billingEntityId: mumbaiEntityId,
          date: '2026-10-17',
          items: [
            {
              referenceType: 'Manual',
              particulars: 'Mumbai Corporate Tax Advisory',
              quantity: 1,
              rate: 20000,
              discount: 0,
              taxableAmount: 20000,
              gstPercentage: 18,
              gstAmount: 3600,
              total: 23600
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.invoiceNo).toBe('INV-MUM-002');
    });

    it('GET /api/v1/reports/branch-sales should aggregate sales and collections grouped by branch', async () => {
      const res = await request(app)
        .get('/api/v1/reports/branch-sales')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.branches).toBeDefined();

      const mumBranch = res.body.data.branches.find((b: any) => b.billingEntityId === mumbaiEntityId);
      expect(mumBranch).toBeDefined();
      expect(mumBranch.invoiceCount).toBe(2);
      expect(mumBranch.totalTaxable).toBe(70000); // 50000 + 20000
      expect(mumBranch.grandTotal).toBe(82600); // 59000 + 23600

      const blrBranch = res.body.data.branches.find((b: any) => b.billingEntityId === bengaluruEntityId);
      expect(blrBranch).toBeDefined();
      expect(blrBranch.invoiceCount).toBe(1);
      expect(blrBranch.totalTaxable).toBe(30000);
      expect(blrBranch.grandTotal).toBe(35400);

      expect(res.body.data.summary.totalInvoices).toBe(3);
      expect(res.body.data.summary.grandTotal).toBe(118000);
    });
  });

  // ─── Phase 144: SaaS Subscription & Plan Enforcement ─────────────
  describe('Phase 144: SaaS Subscription, Seat Quotas & Feature Gating', () => {
    it('POST /api/v1/tenant-settings/subscription should configure Starter plan with 2 users & 1 client limit', async () => {
      const res = await request(app)
        .post('/api/v1/tenant-settings/subscription')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          planTier: 'Starter',
          billingCycle: 'Monthly',
          maxUsers: 2,
          maxClients: 1,
          storageLimitGb: 5,
          featuresEnabled: {
            clientPortal: true,
            timeTracking: false,
            multiBranch: true,
            customDomain: false,
            bulkWhatsApp: false
          },
          status: 'Active'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.planTier).toBe('Starter');
      expect(res.body.data.maxUsers).toBe(2);
      expect(res.body.data.maxClients).toBe(1);
    });

    it('should allow creating a 2nd user (reaching quota limit of 2)', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Junior Associate 1',
          username: `jr_assoc_${Date.now()}`,
          email: `jr1.${Date.now()}@ncg.com`,
          password: 'Password@123',
          confirmPassword: 'Password@123',
          roleId: roleId.toString()
        });

      expect(res.status).toBe(201);
    });

    it('should reject creating a 3rd user with 403 Forbidden (exceeding seat limit)', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Junior Associate 2',
          username: `jr2_assoc_${Date.now()}`,
          email: `jr2.${Date.now()}@ncg.com`,
          password: 'Password@123',
          confirmPassword: 'Password@123',
          roleId: roleId.toString()
        });

      expect(res.status).toBe(403);
      const errMsg = res.body.error?.message || res.body.message;
      expect(errMsg).toContain('User limit reached');
    });

    it('should reject creating a 2nd client with 403 Forbidden (exceeding client quota of 1)', async () => {
      const res = await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Second Client Enterprises',
          fileNo: `F-SECOND-${Date.now()}`,
          pan: 'XYZAB1234C',
          gstin: '27XYZAB1234C1Z0',
          entityType: 'Private Limited'
        });

      expect(res.status).toBe(403);
      const errMsg = res.body.error?.message || res.body.message;
      expect(errMsg).toContain('Client limit reached');
    });
  });

  // ─── Phase 145: Tenant Usage Metrics & Renewal Scanner ───────────
  describe('Phase 145: Tenant Usage Metrics & Automated Renewal Worker', () => {
    it('GET /api/v1/tenant-settings/usage should return usage metrics and quota percentages', async () => {
      const res = await request(app)
        .get('/api/v1/tenant-settings/usage')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const usage = res.body.data;
      expect(usage.planTier).toBe('Starter');
      expect(usage.users.used).toBe(2);
      expect(usage.users.max).toBe(2);
      expect(usage.users.percentage).toBe(100);

      expect(usage.clients.used).toBe(1);
      expect(usage.clients.max).toBe(1);
      expect(usage.clients.percentage).toBe(100);

      expect(usage.daysUntilRenewal).toBeGreaterThan(0);
    });

    it('GET /api/v1/tenant/usage should also return usage metrics via alias endpoint', async () => {
      const res = await request(app)
        .get('/api/v1/tenant/usage')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.planTier).toBe('Starter');
    });

    it('scanExpiringTenants should identify subscriptions expiring within 7 days', async () => {
      // Temporarily set period end to 3 days in future
      const nearExpiry = new Date(Date.now() + 3 * 86400 * 1000);
      await TenantSubscription.updateOne(
        { tenantId },
        { currentPeriodEnd: nearExpiry }
      );

      const alerts = await TenantRenewalService.scanExpiringTenants();
      expect(alerts.length).toBeGreaterThanOrEqual(1);

      const myAlert = alerts.find(a => a.tenantId.toString() === tenantId.toString());
      expect(myAlert).toBeDefined();
      expect(myAlert!.daysRemaining).toBeLessThanOrEqual(3);
      expect(myAlert!.urgency).toBe('Warning');
    });

    it('should isolate billing entities so Other Tenant cannot see or alter Tenant A entities', async () => {
      const res = await request(app)
        .get('/api/v1/tenant-settings/billing-entities')
        .set('Authorization', `Bearer ${otherStaffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);

      const delRes = await request(app)
        .delete(`/api/v1/tenant-settings/billing-entities/${mumbaiEntityId}`)
        .set('Authorization', `Bearer ${otherStaffToken}`);

      expect(delRes.status).toBe(404);
    });
  });
});
