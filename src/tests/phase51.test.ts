import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { TenantSettings } from '../modules/masters/schemas/tenant-settings.schema';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 10: Phase 51 — Working Days & Weekend Settings API', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;

  const orgASlug = 'workdays-orga-p51';
  const orgBSlug = 'workdays-orgb-p51';
  const userAEmail = 'adminA.p51@example.com';
  const userBEmail = 'adminB.p51@example.com';

  beforeAll(async () => {
    await connectDB();

    // Cleanup previous test state
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({ name: 'WorkDays Org A P51', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    await User.create({
      tenantId: orgAId,
      name: 'Admin A P51',
      username: 'admin_a_p51',
      email: userAEmail,
      password: 'password123',
      roleId: roleA._id
    });

    const loginResA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userAEmail, password: 'password123' });
    tokenA = loginResA.body.data.accessToken;

    // Setup Org B (for multi-tenant isolation verification)
    const orgB = await Organization.create({ name: 'WorkDays Org B P51', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    await User.create({
      tenantId: orgBId,
      name: 'Admin B P51',
      username: 'admin_b_p51',
      email: userBEmail,
      password: 'password123',
      roleId: roleB._id
    });

    const loginResB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userBEmail, password: 'password123' });
    tokenB = loginResB.body.data.accessToken;
  });

  afterAll(async () => {
    await TenantSettings.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  describe('1. GET /api/v1/tenant-settings/work-days', () => {
    it('should return default work days and weekend configuration for Org A', async () => {
      const res = await request(app)
        .get('/api/v1/tenant-settings/work-days')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.weekends).toEqual(['Sunday']);
      expect(res.body.data.standardWorkHoursPerDay).toBe(8.5);
    });

    it('should reject unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/tenant-settings/work-days');
      expect(res.status).toBe(401);
    });
  });

  describe('2. PUT /api/v1/tenant-settings/work-days', () => {
    it('should update weekends to Saturday and Sunday with custom work hours', async () => {
      const res = await request(app)
        .put('/api/v1/tenant-settings/work-days')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          weekends: ['Saturday', 'Sunday'],
          standardWorkHoursPerDay: 8
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.weekends).toEqual(['Saturday', 'Sunday']);
      expect(res.body.data.standardWorkHoursPerDay).toBe(8);
    });

    it('should maintain strict multi-tenant isolation (Org B remains on default)', async () => {
      const res = await request(app)
        .get('/api/v1/tenant-settings/work-days')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.weekends).toEqual(['Sunday']);
      expect(res.body.data.standardWorkHoursPerDay).toBe(8.5);
    });

    it('should reject invalid weekend day names', async () => {
      const res = await request(app)
        .put('/api/v1/tenant-settings/work-days')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          weekends: ['Funday']
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Validation Error');
    });

    it('should reject empty weekend list', async () => {
      const res = await request(app)
        .put('/api/v1/tenant-settings/work-days')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          weekends: []
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject standardWorkHoursPerDay exceeding 24 or non-positive', async () => {
      const res1 = await request(app)
        .put('/api/v1/tenant-settings/work-days')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          standardWorkHoursPerDay: 25
        });

      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .put('/api/v1/tenant-settings/work-days')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          standardWorkHoursPerDay: 0
        });

      expect(res2.status).toBe(400);
    });

    it('should verify persistence on subsequent GET /api/v1/tenant-settings/work-days', async () => {
      const res = await request(app)
        .get('/api/v1/tenant-settings/work-days')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.weekends).toEqual(['Saturday', 'Sunday']);
      expect(res.body.data.standardWorkHoursPerDay).toBe(8);
    });
  });
});
