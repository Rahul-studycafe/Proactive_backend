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

describe('Part 12: Phase 58 — Staff Attendance Summary & Payable Days API', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let staff1AId: mongoose.Types.ObjectId;
  let staff2AId: mongoose.Types.ObjectId;
  let staffBId: mongoose.Types.ObjectId;
  let tokenA: string;

  const orgASlug = 'att-summary-orga-p58';
  const orgBSlug = 'att-summary-orgb-p58';
  const staff1AEmail = 'staff1a.p58@example.com';
  const staff2AEmail = 'staff2a.p58@example.com';
  const staffBEmail = 'staffb.p58@example.com';

  const aprilYear = '2026';
  const aprilMonth = '04';

  beforeAll(async () => {
    await connectDB();
    await Attendance.init();
    await Holiday.init();

    // Clean up
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [staff1AEmail, staff2AEmail, staffBEmail] }
    }).setOptions({ skipTenantPlugin: true });
    await Holiday.deleteMany({
      date: { $in: ['2026-04-10', '2026-04-14', '2026-04-17', '2026-04-21'] }
    }).setOptions({ skipTenantPlugin: true });

    // Setup Tenant A
    const orgA = await Organization.create({ name: 'Summary Org A P58', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Staff Role P58',
      isSuperAdmin: false,
      permissions: {
        attendance: {
          manage: { allowed: true, scope: 'everything' }
        }
      }
    });

    const staff1A = await User.create({
      tenantId: orgAId,
      name: 'Alice Payroll Staff',
      username: 'alice_p58',
      email: staff1AEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    staff1AId = staff1A._id as mongoose.Types.ObjectId;

    const staff2A = await User.create({
      tenantId: orgAId,
      name: 'Bob Deductions Staff',
      username: 'bob_p58',
      email: staff2AEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    staff2AId = staff2A._id as mongoose.Types.ObjectId;

    // Setup Tenant B
    const orgB = await Organization.create({ name: 'Summary Org B P58', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Role B P58',
      isSuperAdmin: false,
      permissions: {}
    });

    const staffB = await User.create({
      tenantId: orgBId,
      name: 'Eve Foreign Staff Org B',
      username: 'eve_p58',
      email: staffBEmail,
      password: 'password123',
      roleId: roleB._id,
      isActive: true
    });
    staffBId = staffB._id as mongoose.Types.ObjectId;

    // Login token for Org A
    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: staff1AEmail, password: 'password123' });
    tokenA = loginA.body.data.accessToken;

    // In April 2026 (30 days):
    // Sundays: 5, 12, 19, 26 (4 weekend days)
    // Add 4 official weekday holidays -> Total non-working days = 8
    await Holiday.create([
      { tenantId: orgAId, name: 'Good Friday', date: '2026-04-10', type: 'National' },
      { tenantId: orgAId, name: 'Ambedkar Jayanti', date: '2026-04-14', type: 'Festival' },
      { tenantId: orgAId, name: 'Office Holiday 1', date: '2026-04-17', type: 'Other' },
      { tenantId: orgAId, name: 'Office Holiday 2', date: '2026-04-21', type: 'Other' }
    ]);

    // Seed User 1 (Alice):
    // 20 Present days, 2 Half Day, 1 Paid Leave -> Total working days accounted = 22
    // With 8 holidays, payableDays = 20 + 1 + 1 + 8 = 30, attendancePercentage = 100%
    const presentDaysArray = [
      '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04',
      '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09',
      '2026-04-11', '2026-04-13', '2026-04-15', '2026-04-16',
      '2026-04-18', '2026-04-20', '2026-04-22', '2026-04-23',
      '2026-04-24', '2026-04-27', '2026-04-28', '2026-04-29'
    ];

    const aliceAttendanceDocs: any[] = presentDaysArray.map((date) => ({
      tenantId: orgAId,
      userId: staff1AId,
      date,
      status: 'Present',
      totalMinutes: 480,
      overtimeMinutes: 0,
      markedBy: staff1AId
    }));

    // 2 Half days for Alice
    aliceAttendanceDocs.push(
      {
        tenantId: orgAId,
        userId: staff1AId,
        date: '2026-04-30',
        status: 'Half Day',
        totalMinutes: 200,
        overtimeMinutes: 0,
        markedBy: staff1AId
      },
      {
        tenantId: orgAId,
        userId: staff1AId,
        date: '2026-04-25',
        status: 'Half Day',
        totalMinutes: 180,
        overtimeMinutes: 0,
        markedBy: staff1AId
      }
    );

    // 1 Paid Leave for Alice
    aliceAttendanceDocs.push({
      tenantId: orgAId,
      userId: staff1AId,
      date: '2026-04-05', // On a Sunday or working day
      status: 'Paid Leave',
      totalMinutes: 0,
      overtimeMinutes: 0,
      markedBy: staff1AId
    });

    await Attendance.create(aliceAttendanceDocs);

    // Seed User 2 (Bob):
    // 15 Present, 2 Half Day, 0 Paid Leave, 2 Unpaid Leave ('Leave'), 3 Absent
    const bobPresentDays = [
      '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04',
      '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09',
      '2026-04-11', '2026-04-13', '2026-04-15', '2026-04-16',
      '2026-04-18', '2026-04-20', '2026-04-22'
    ];
    const bobDocs: any[] = bobPresentDays.map((date) => ({
      tenantId: orgAId,
      userId: staff2AId,
      date,
      status: 'Present',
      totalMinutes: 480,
      markedBy: staff1AId
    }));

    bobDocs.push(
      { tenantId: orgAId, userId: staff2AId, date: '2026-04-23', status: 'Half Day', totalMinutes: 180, markedBy: staff1AId },
      { tenantId: orgAId, userId: staff2AId, date: '2026-04-24', status: 'Half Day', totalMinutes: 210, markedBy: staff1AId },
      { tenantId: orgAId, userId: staff2AId, date: '2026-04-27', status: 'Leave', totalMinutes: 0, markedBy: staff1AId },
      { tenantId: orgAId, userId: staff2AId, date: '2026-04-28', status: 'Leave', totalMinutes: 0, markedBy: staff1AId },
      { tenantId: orgAId, userId: staff2AId, date: '2026-04-29', status: 'Absent', totalMinutes: 0, markedBy: staff1AId },
      { tenantId: orgAId, userId: staff2AId, date: '2026-04-30', status: 'Absent', totalMinutes: 0, markedBy: staff1AId },
      { tenantId: orgAId, userId: staff2AId, date: '2026-04-25', status: 'Absent', totalMinutes: 0, markedBy: staff1AId }
    );
    await Attendance.create(bobDocs);
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
      email: { $in: [staff1AEmail, staff2AEmail, staffBEmail] }
    }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({
      skipTenantPlugin: true
    });
  });

  it('1. should calculate payableDays = 30 and attendancePercentage = 100% for 20 present, 2 half-days, 1 paid leave, and 8 holidays', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/summary/${staff1AId}?month=${aprilMonth}&year=${aprilYear}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.userId).toBe(staff1AId.toString());
    expect(data.userName).toBe('Alice Payroll Staff');
    expect(data.month).toBe('04');
    expect(data.year).toBe('2026');
    expect(data.totalDays).toBe(30);
    expect(data.presentDays).toBe(20);
    expect(data.halfDays).toBe(2);
    expect(data.paidLeaves).toBe(1);
    expect(data.holidays).toBe(8);

    // Math engine verification:
    // payableDays = 20 + (2 * 0.5) + 1 + 8 = 30
    expect(data.payableDays).toBe(30);

    // attendancePercentage = (20 + 1 + 1) / (30 - 8) * 100 = 100%
    expect(data.attendancePercentage).toBe(100);
  });

  it('2. should accurately compute deductions for unpaid leaves and absences', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/summary/${staff2AId}?month=${aprilMonth}&year=${aprilYear}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.presentDays).toBe(15);
    expect(data.halfDays).toBe(2);
    expect(data.paidLeaves).toBe(0);
    expect(data.unpaidLeaves).toBe(2);
    expect(data.absentDays).toBe(3);
    expect(data.holidays).toBe(8);

    // payableDays = 15 + 1 + 0 + 8 = 24
    expect(data.payableDays).toBe(24);

    // attendancePercentage = (15 + 1) / (30 - 8) * 100 = 16 / 22 * 100 = 72.73%
    expect(data.attendancePercentage).toBe(72.73);
  });

  it('3. should reject summary requests for employees in another tenant with 404 USER_NOT_FOUND', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/summary/${staffBId}?month=${aprilMonth}&year=${aprilYear}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('4. should reject validation errors on invalid userId, month or year', async () => {
    // Bad userId format
    const res1 = await request(app)
      .get(`/api/v1/attendance/summary/not-an-object-id?month=04&year=2026`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res1.status).toBe(400);

    // Month out of range
    const res2 = await request(app)
      .get(`/api/v1/attendance/summary/${staff1AId}?month=15&year=2026`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res2.status).toBe(400);

    // Year not 4 digits
    const res3 = await request(app)
      .get(`/api/v1/attendance/summary/${staff1AId}?month=04&year=26`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res3.status).toBe(400);
  });

  it('5. should reject unauthenticated requests with 401', async () => {
    const res = await request(app).get(`/api/v1/attendance/summary/${staff1AId}`);
    expect(res.status).toBe(401);
  });
});
