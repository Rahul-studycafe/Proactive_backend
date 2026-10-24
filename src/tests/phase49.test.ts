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

describe('Part 10: Phase 49 — Holiday Model & Multi-Tenant Calendar API', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;

  const orgASlug = 'holiday-orga-p49';
  const orgBSlug = 'holiday-orgb-p49';
  const userAEmail = 'adminA.p49@example.com';
  const userBEmail = 'adminB.p49@example.com';

  beforeAll(async () => {
    await connectDB();

    // Cleanup previous test state
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({ name: 'Holiday Org A', slug: orgASlug });
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
      username: 'admin_a_p49',
      email: userAEmail,
      password: 'password123',
      roleId: roleA._id
    });

    const loginResA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userAEmail, password: 'password123' });
    tokenA = loginResA.body.data.accessToken;

    // Setup Org B (for multi-tenant isolation testing)
    const orgB = await Organization.create({ name: 'Holiday Org B', slug: orgBSlug });
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
      username: 'admin_b_p49',
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
    await Holiday.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('1. should create a national holiday successfully for Org A', async () => {
    const res = await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Republic Day',
        date: '2026-01-26',
        type: 'National',
        description: 'National holiday commemorating the Constitution'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Republic Day');
    expect(res.body.data.date).toBe('2026-01-26');
    expect(res.body.data.type).toBe('National');
    expect(res.body.data.tenantId.toString()).toBe(orgAId.toString());
  });

  it('2. should reject holiday creation with invalid date format (not YYYY-MM-DD)', async () => {
    const res = await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Invalid Date Holiday',
        date: '26-01-2026', // wrong format
        type: 'Festival'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('YYYY-MM-DD');
  });

  it('3. should reject holiday creation with missing name', async () => {
    const res = await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: '   ',
        date: '2026-03-25'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('4. should prevent date collision within the same tenant', async () => {
    // Attempt to create another holiday on 2026-01-26 for Org A
    const res = await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Duplicate Day Celebration',
        date: '2026-01-26',
        type: 'Optional'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('HOLIDAY_DATE_COLLISION');
  });

  it('5. should allow Org B to create a holiday on the same date (2026-01-26) due to tenant isolation', async () => {
    const res = await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Org B Republic Day',
        date: '2026-01-26',
        type: 'National'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tenantId.toString()).toBe(orgBId.toString());
  });

  it('6. should return holidays in chronological ascending order', async () => {
    // Create multiple holidays in non-chronological order for Org A
    await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Gandhi Jayanti', date: '2026-10-02', type: 'National' });

    await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Independence Day', date: '2026-08-15', type: 'National' });

    await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Diwali', date: '2026-11-08', type: 'Festival' });

    const res = await request(app)
      .get('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(4);

    const dates = res.body.data.map((h: any) => h.date);
    expect(dates).toEqual(['2026-01-26', '2026-08-15', '2026-10-02', '2026-11-08']);
  });

  it('7. should maintain strict tenant data isolation on GET /api/v1/holidays', async () => {
    // Org B should only see its own 1 holiday
    const resB = await request(app)
      .get('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.data.length).toBe(1);
    expect(resB.body.data[0].name).toBe('Org B Republic Day');

    // Org A has 4 holidays, none of which belong to Org B
    const resA = await request(app)
      .get('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(resA.status).toBe(200);
    expect(resA.body.data.length).toBe(4);
    const names = resA.body.data.map((h: any) => h.name);
    expect(names).not.toContain('Org B Republic Day');
  });

  it('8. should filter holidays by year', async () => {
    // Create a 2027 holiday for Org A
    await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'New Year 2027', date: '2027-01-01', type: 'National' });

    const res2026 = await request(app)
      .get('/api/v1/holidays?year=2026')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res2026.status).toBe(200);
    expect(res2026.body.data.length).toBe(4);
    res2026.body.data.forEach((h: any) => {
      expect(h.date.startsWith('2026-')).toBe(true);
    });

    const res2027 = await request(app)
      .get('/api/v1/holidays?year=2027')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res2027.status).toBe(200);
    expect(res2027.body.data.length).toBe(1);
    expect(res2027.body.data[0].name).toBe('New Year 2027');
  });

  it('9. should filter holidays by type', async () => {
    const res = await request(app)
      .get('/api/v1/holidays?type=Festival')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Diwali');
    expect(res.body.data[0].type).toBe('Festival');
  });
});
