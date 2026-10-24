import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Holiday } from '../models/Holiday';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 10: Phase 50 — Holiday Read, Update & Deletion API', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;

  const orgASlug = 'holiday-orga-p50';
  const orgBSlug = 'holiday-orgb-p50';
  const userAEmail = 'adminA.p50@example.com';
  const userBEmail = 'adminB.p50@example.com';

  let holidayA1Id: string;
  let holidayA2Id: string;
  let holidayBId: string;

  beforeAll(async () => {
    await connectDB();

    // Cleanup previous test state
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({ name: 'Holiday Org A P50', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    await User.create({
      tenantId: orgAId,
      name: 'Admin A P50',
      username: 'admin_a_p50',
      email: userAEmail,
      password: 'password123',
      roleId: roleA._id
    });

    const loginResA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userAEmail, password: 'password123' });
    tokenA = loginResA.body.data.accessToken;

    // Setup Org B (for multi-tenant security verification)
    const orgB = await Organization.create({ name: 'Holiday Org B P50', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    await User.create({
      tenantId: orgBId,
      name: 'Admin B P50',
      username: 'admin_b_p50',
      email: userBEmail,
      password: 'password123',
      roleId: roleB._id
    });

    const loginResB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userBEmail, password: 'password123' });
    tokenB = loginResB.body.data.accessToken;

    // Create Initial Seed Holidays for Org A
    const seed1 = await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Gandhi Jayanti',
        date: '2026-10-02',
        type: 'National',
        description: 'Birth anniversary of Mahatma Gandhi'
      });
    holidayA1Id = seed1.body.data._id;

    const seed2 = await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Christmas Day',
        date: '2026-12-25',
        type: 'Festival'
      });
    holidayA2Id = seed2.body.data._id;

    // Create Initial Seed Holiday for Org B
    const seedB = await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Org B Christmas',
        date: '2026-12-25',
        type: 'Festival'
      });
    holidayBId = seedB.body.data._id;
  });

  afterAll(async () => {
    await Holiday.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  describe('1. GET /api/v1/holidays/:id (Read Single Holiday)', () => {
    it('should fetch a single holiday by ID for Org A', async () => {
      const res = await request(app)
        .get(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(holidayA1Id);
      expect(res.body.data.name).toBe('Gandhi Jayanti');
      expect(res.body.data.date).toBe('2026-10-02');
      expect(res.body.data.type).toBe('National');
    });

    it('should return 400 for an invalid ObjectId format', async () => {
      const res = await request(app)
        .get('/api/v1/holidays/invalid-mongo-id')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_ID');
    });

    it('should return 404 for a non-existent holiday ID', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/v1/holidays/${nonExistentId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HOLIDAY_NOT_FOUND');
    });

    it('should enforce tenant isolation (Org B cannot read Org A holiday via ID)', async () => {
      const res = await request(app)
        .get(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HOLIDAY_NOT_FOUND');
    });
  });

  describe('2. PUT /api/v1/holidays/:id (Update Holiday)', () => {
    it('should update name, type, and description successfully', async () => {
      const res = await request(app)
        .put(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Mahatma Gandhi Jayanti (Observed)',
          type: 'National',
          description: 'Updated celebration description'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Mahatma Gandhi Jayanti (Observed)');
      expect(res.body.data.description).toBe('Updated celebration description');
      expect(res.body.data.date).toBe('2026-10-02'); // Date unchanged
    });

    it('should update date to a new non-colliding date', async () => {
      const res = await request(app)
        .put(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          date: '2026-10-03'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.date).toBe('2026-10-03');
    });

    it('should reject date update if it collides with another holiday in Org A', async () => {
      // Trying to change holidayA1 to 2026-12-25, which already belongs to holidayA2 (Christmas Day)
      const res = await request(app)
        .put(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          date: '2026-12-25'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HOLIDAY_DATE_COLLISION');
      expect(res.body.error.message).toContain('Christmas Day');
    });

    it('should reject update with invalid date format', async () => {
      const res = await request(app)
        .put(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          date: '03-10-2026'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('YYYY-MM-DD');
    });

    it('should reject update with empty name', async () => {
      const res = await request(app)
        .put(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: '   '
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should enforce tenant isolation (Org B cannot update Org A holiday)', async () => {
      const res = await request(app)
        .put(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: 'Hacked by Org B'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HOLIDAY_NOT_FOUND');
    });
  });

  describe('3. DELETE /api/v1/holidays/:id (Delete Holiday)', () => {
    it('should prevent Org B from deleting Org A holiday', async () => {
      const res = await request(app)
        .delete(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HOLIDAY_NOT_FOUND');
    });

    it('should delete a holiday successfully for Org A', async () => {
      const res = await request(app)
        .delete(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted successfully');
    });

    it('should verify deleted holiday no longer appears in GET /api/v1/holidays', async () => {
      const res = await request(app)
        .get('/api/v1/holidays')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((h: any) => h._id);
      expect(ids).not.toContain(holidayA1Id);
      expect(ids).toContain(holidayA2Id);
    });

    it('should return 404 when querying deleted holiday via GET /:id', async () => {
      const res = await request(app)
        .get(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HOLIDAY_NOT_FOUND');
    });

    it('should return 404 when attempting to delete an already deleted holiday', async () => {
      const res = await request(app)
        .delete(`/api/v1/holidays/${holidayA1Id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HOLIDAY_NOT_FOUND');
    });

    it('should return 400 when attempting to delete with invalid ObjectId', async () => {
      const res = await request(app)
        .delete('/api/v1/holidays/malformed-id')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_ID');
    });
  });
});
