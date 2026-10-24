import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Attendance } from '../models/Attendance';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 11: Phase 55 — Admin Attendance Entry & Overrides API', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let adminAId: mongoose.Types.ObjectId;
  let employeeAId: mongoose.Types.ObjectId;
  let employeeBId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;

  const orgASlug = 'admin-mark-orga-p55';
  const orgBSlug = 'admin-mark-orgb-p55';
  const adminAEmail = 'admina.p55@example.com';
  const employeeAEmail = 'employeea.p55@example.com';
  const employeeBEmail = 'employeeb.p55@example.com';

  const testPastDate = '2026-10-15';

  beforeAll(async () => {
    await connectDB();
    await Attendance.init();

    // Clean up existing test data
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [adminAEmail, employeeAEmail, employeeBEmail] }
    }).setOptions({ skipTenantPlugin: true });

    // Setup Tenant A
    const orgA = await Organization.create({ name: 'Mark Org A P55', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Manager Role',
      isSuperAdmin: false,
      permissions: {
        attendance: {
          manage: { allowed: true, scope: 'everything' }
        }
      }
    });

    const adminA = await User.create({
      tenantId: orgAId,
      name: 'Admin Alice',
      username: 'alice_admin_p55',
      email: adminAEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    adminAId = adminA._id as mongoose.Types.ObjectId;

    const employeeA = await User.create({
      tenantId: orgAId,
      name: 'Staff Bob',
      username: 'bob_staff_p55',
      email: employeeAEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    employeeAId = employeeA._id as mongoose.Types.ObjectId;

    // Setup Tenant B
    const orgB = await Organization.create({ name: 'Mark Org B P55', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Manager Role B',
      isSuperAdmin: false,
      permissions: {}
    });

    const employeeB = await User.create({
      tenantId: orgBId,
      name: 'Staff Eve Org B',
      username: 'eve_staff_p55',
      email: employeeBEmail,
      password: 'password123',
      roleId: roleB._id,
      isActive: true
    });
    employeeBId = employeeB._id as mongoose.Types.ObjectId;

    // Login users
    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminAEmail, password: 'password123' });
    tokenA = loginA.body.data.accessToken;

    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: employeeBEmail, password: 'password123' });
    tokenB = loginB.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    await Attendance.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({
      skipTenantPlugin: true
    });
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [adminAEmail, employeeAEmail, employeeBEmail] }
    }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({
      skipTenantPlugin: true
    });
  });

  it('1. should allow admin to manually mark Paid Leave for an employee on a past date', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userId: employeeAId.toString(),
        date: testPastDate,
        status: 'Paid Leave',
        notes: 'Approved retroactive paid leave'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      tenantId: orgAId.toString(),
      userId: employeeAId.toString(),
      date: testPastDate,
      status: 'Paid Leave',
      markedBy: adminAId.toString(),
      notes: 'Approved retroactive paid leave'
    });

    // Check DB directly
    const saved = await Attendance.findOne({
      tenantId: orgAId,
      userId: employeeAId,
      date: testPastDate
    });
    expect(saved).not.toBeNull();
    expect(saved?.status).toBe('Paid Leave');
    expect(saved?.markedBy.toString()).toBe(adminAId.toString());
  });

  it('2. should allow admin to override an existing attendance entry with punch times and overtime', async () => {
    const checkInTime = '2026-10-15T09:00:00.000Z';
    const checkOutTime = '2026-10-15T18:00:00.000Z'; // 9 hours = 540 mins

    const res = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userId: employeeAId.toString(),
        date: testPastDate,
        status: 'Present',
        checkIn: checkInTime,
        checkOut: checkOutTime,
        notes: 'Forgotten punch corrected by manager'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('Present');
    expect(res.body.data.totalMinutes).toBe(540);
    // Standard work hours default is 8.5h (510m) -> Overtime = 30m
    expect(res.body.data.overtimeMinutes).toBe(30);
    expect(res.body.data.markedBy).toBe(adminAId.toString());
  });

  it('3. should allow admin to mark Absent with zero totalMinutes', async () => {
    const dateStr = '2026-10-16';
    const res = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userId: employeeAId.toString(),
        date: dateStr,
        status: 'Absent',
        notes: 'Unexcused absence'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('Absent');
    expect(res.body.data.totalMinutes).toBe(0);
    expect(res.body.data.overtimeMinutes).toBe(0);
  });

  it('4. should reject marking attendance for an employee belonging to another tenant (404)', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userId: employeeBId.toString(), // Belongs to Org B
        date: testPastDate,
        status: 'Present'
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('5. should reject validation errors (invalid userId, date, status, checkOut < checkIn)', async () => {
    // Invalid userId format
    const res1 = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userId: 'invalid-id-format',
        date: testPastDate,
        status: 'Present'
      });
    expect(res1.status).toBe(400);

    // Invalid date format
    const res2 = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userId: employeeAId.toString(),
        date: '15-10-2026',
        status: 'Present'
      });
    expect(res2.status).toBe(400);

    // Invalid status enum
    const res3 = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userId: employeeAId.toString(),
        date: testPastDate,
        status: 'Late'
      });
    expect(res3.status).toBe(400);

    // checkOut earlier than checkIn
    const res4 = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userId: employeeAId.toString(),
        date: testPastDate,
        status: 'Present',
        checkIn: '2026-10-15T18:00:00.000Z',
        checkOut: '2026-10-15T09:00:00.000Z'
      });
    expect(res4.status).toBe(400);
    expect(res4.body.error.code).toBe('INVALID_CHECK_OUT_TIME');
  });

  it('6. should reject unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/mark')
      .send({
        userId: employeeAId.toString(),
        date: testPastDate,
        status: 'Present'
      });

    expect(res.status).toBe(401);
  });
});
