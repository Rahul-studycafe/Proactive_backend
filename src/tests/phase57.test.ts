import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Holiday } from '../models/Holiday';
import { Attendance } from '../models/Attendance';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 12: Phase 57 — Monthly Attendance Matrix Aggregation API', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let staff1AId: mongoose.Types.ObjectId;
  let staff2AId: mongoose.Types.ObjectId;
  let inactiveStaffAId: mongoose.Types.ObjectId;
  let staffBId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;

  const orgASlug = 'monthly-matrix-orga-p57';
  const orgBSlug = 'monthly-matrix-orgb-p57';
  const staff1AEmail = 'staff1a.p57@example.com';
  const staff2AEmail = 'staff2a.p57@example.com';
  const inactiveStaffAEmail = 'inactive.p57@example.com';
  const staffBEmail = 'staffb.p57@example.com';

  const aprilYear = '2026';
  const aprilMonth = '04';

  beforeAll(async () => {
    await connectDB();
    await Attendance.init();
    await Holiday.init();

    // Clean up test data
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [staff1AEmail, staff2AEmail, inactiveStaffAEmail, staffBEmail] }
    }).setOptions({ skipTenantPlugin: true });
    await Holiday.deleteMany({
      date: { $in: ['2026-04-10', '2026-04-14', '2026-04-25'] }
    }).setOptions({ skipTenantPlugin: true });

    // Setup Tenant A
    const orgA = await Organization.create({ name: 'Matrix Org A P57', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Associate Role P57',
      isSuperAdmin: false,
      permissions: {
        attendance: {
          manage: { allowed: true, scope: 'everything' }
        }
      }
    });

    const staff1A = await User.create({
      tenantId: orgAId,
      name: 'Alice Active Staff 1',
      username: 'alice_p57',
      email: staff1AEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    staff1AId = staff1A._id as mongoose.Types.ObjectId;

    const staff2A = await User.create({
      tenantId: orgAId,
      name: 'Bob Active Staff 2',
      username: 'bob_p57',
      email: staff2AEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    staff2AId = staff2A._id as mongoose.Types.ObjectId;

    const inactiveStaffA = await User.create({
      tenantId: orgAId,
      name: 'Charlie Inactive Staff',
      username: 'charlie_inactive_p57',
      email: inactiveStaffAEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: false
    });
    inactiveStaffAId = inactiveStaffA._id as mongoose.Types.ObjectId;

    // Setup Tenant B
    const orgB = await Organization.create({ name: 'Matrix Org B P57', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Role B P57',
      isSuperAdmin: false,
      permissions: {}
    });

    const staffB = await User.create({
      tenantId: orgBId,
      name: 'Eve Foreign Staff Org B',
      username: 'eve_p57',
      email: staffBEmail,
      password: 'password123',
      roleId: roleB._id,
      isActive: true
    });
    staffBId = staffB._id as mongoose.Types.ObjectId;

    // Login tokens
    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: staff1AEmail, password: 'password123' });
    tokenA = loginA.body.data.accessToken;

    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: staffBEmail, password: 'password123' });
    tokenB = loginB.body.data.accessToken;

    // Register 2 official holidays in Org A for April 2026
    await Holiday.create([
      {
        tenantId: orgAId,
        name: 'Good Friday',
        date: '2026-04-10',
        type: 'National',
        description: 'National office holiday'
      },
      {
        tenantId: orgAId,
        name: 'Ambedkar Jayanti',
        date: '2026-04-14',
        type: 'Festival',
        description: 'Gazetted holiday'
      }
    ]);

    // Register 1 holiday in Org B for April 2026 (Isolation test)
    await Holiday.create({
      tenantId: orgBId,
      name: 'Tenant B Specific Holiday',
      date: '2026-04-25',
      type: 'Other'
    });

    // Seed attendance records for Org A in April 2026
    // Alice (staff1A) has Present on Day 1, Half Day on Day 2
    await Attendance.create([
      {
        tenantId: orgAId,
        userId: staff1AId,
        date: '2026-04-01',
        status: 'Present',
        checkIn: new Date('2026-04-01T09:00:00Z'),
        checkOut: new Date('2026-04-01T17:00:00Z'),
        totalMinutes: 480,
        markedBy: staff1AId
      },
      {
        tenantId: orgAId,
        userId: staff1AId,
        date: '2026-04-02',
        status: 'Half Day',
        checkIn: new Date('2026-04-02T09:00:00Z'),
        checkOut: new Date('2026-04-02T12:30:00Z'),
        totalMinutes: 210,
        markedBy: staff1AId
      },
      // Bob (staff2A) on Leave on Day 1
      {
        tenantId: orgAId,
        userId: staff2AId,
        date: '2026-04-01',
        status: 'Leave',
        markedBy: staff1AId,
        notes: 'Personal leave'
      }
    ]);
  }, 30000);

  afterAll(async () => {
    await Attendance.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({
      skipTenantPlugin: true
    });
    await Holiday.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({
      skipTenantPlugin: true
    });
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [staff1AEmail, staff2AEmail, inactiveStaffAEmail, staffBEmail] }
    }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({
      skipTenantPlugin: true
    });
  });

  it('1. should return 30-day matrix for April 2026 with 2 registered holidays and holiday badges', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/monthly?month=${aprilMonth}&year=${aprilYear}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.month).toBe('04');
    expect(data.year).toBe('2026');
    expect(data.daysInMonth).toBe(30);

    // Verify holidays list in response
    expect(data.holidays.length).toBe(2);
    const holidayNames = data.holidays.map((h: any) => h.name);
    expect(holidayNames).toContain('Good Friday');
    expect(holidayNames).toContain('Ambedkar Jayanti');

    // Verify 30 calendar days structure
    expect(data.days.length).toBe(30);

    // Day 10 (2026-04-10) is Good Friday
    const day10 = data.days.find((d: any) => d.day === 10);
    expect(day10).toBeDefined();
    expect(day10.isHoliday).toBe(true);
    expect(day10.holiday.name).toBe('Good Friday');
    expect(day10.holiday.type).toBe('National');

    // Day 14 (2026-04-14) is Ambedkar Jayanti
    const day14 = data.days.find((d: any) => d.day === 14);
    expect(day14).toBeDefined();
    expect(day14.isHoliday).toBe(true);
    expect(day14.holiday.name).toBe('Ambedkar Jayanti');

    // Day 5 (2026-04-05) is a Sunday (Weekend)
    const day5 = data.days.find((d: any) => d.day === 5);
    expect(day5.dayOfWeek).toBe('Sunday');
    expect(day5.isWeekend).toBe(true);

    // Verify staff members: only active staff included (Alice and Bob; Charlie is inactive)
    expect(data.staff.length).toBe(2);
    const staffNames = data.staff.map((s: any) => s.name);
    expect(staffNames).toContain('Alice Active Staff 1');
    expect(staffNames).toContain('Bob Active Staff 2');
    expect(staffNames).not.toContain('Charlie Inactive Staff');

    // Verify matrix content for Alice
    const aliceMatrix = data.matrix[staff1AId.toString()];
    expect(aliceMatrix).toBeDefined();
    expect(aliceMatrix[1].status).toBe('Present');
    expect(aliceMatrix[1].totalMinutes).toBe(480);
    expect(aliceMatrix[2].status).toBe('Half Day');
    expect(aliceMatrix[2].totalMinutes).toBe(210);

    // Verify matrix content for Bob
    const bobMatrix = data.matrix[staff2AId.toString()];
    expect(bobMatrix).toBeDefined();
    expect(bobMatrix[1].status).toBe('Leave');
  });

  it('2. should default to current month and year when query parameters are omitted', async () => {
    const res = await request(app)
      .get('/api/v1/attendance/monthly')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const now = new Date();
    const expectedMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
    const expectedYear = String(now.getUTCFullYear());

    expect(res.body.data.month).toBe(expectedMonth);
    expect(res.body.data.year).toBe(expectedYear);
    expect(res.body.data.days.length).toBe(res.body.data.daysInMonth);
  });

  it('3. should enforce multi-tenant isolation (Tenant B holidays and staff not visible in Tenant A)', async () => {
    const resA = await request(app)
      .get(`/api/v1/attendance/monthly?month=${aprilMonth}&year=${aprilYear}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(resA.status).toBe(200);
    // Org A must NOT see Tenant B holiday (2026-04-25)
    const orgAHolidays = resA.body.data.holidays.map((h: any) => h.name);
    expect(orgAHolidays).not.toContain('Tenant B Specific Holiday');

    // Org B calling the endpoint should only see Eve and Org B holiday
    const resB = await request(app)
      .get(`/api/v1/attendance/monthly?month=${aprilMonth}&year=${aprilYear}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.data.holidays.length).toBe(1);
    expect(resB.body.data.holidays[0].name).toBe('Tenant B Specific Holiday');
    expect(resB.body.data.staff.length).toBe(1);
    expect(resB.body.data.staff[0].name).toBe('Eve Foreign Staff Org B');
  });

  it('4. should reject validation errors on invalid month or year query format', async () => {
    // Month > 12
    const res1 = await request(app)
      .get('/api/v1/attendance/monthly?month=13&year=2026')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res1.status).toBe(400);

    // Month not a number
    const res2 = await request(app)
      .get('/api/v1/attendance/monthly?month=april&year=2026')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res2.status).toBe(400);

    // Year not 4 digits
    const res3 = await request(app)
      .get('/api/v1/attendance/monthly?month=04&year=26')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res3.status).toBe(400);
  });

  it('5. should reject unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/v1/attendance/monthly');
    expect(res.status).toBe(401);
  });
});
