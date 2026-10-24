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

describe('Part 11: Phase 56 — Bulk Attendance Actions API', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let adminAId: mongoose.Types.ObjectId;
  let staffIds: mongoose.Types.ObjectId[] = [];
  let userOrgBId: mongoose.Types.ObjectId;
  let tokenA: string;

  const orgASlug = 'bulk-att-orga-p56';
  const orgBSlug = 'bulk-att-orgb-p56';
  const adminAEmail = 'admina.p56@example.com';
  const userOrgBEmail = 'orgb.p56@example.com';

  const testDate = '2026-10-23';

  beforeAll(async () => {
    await connectDB();
    await Attendance.init();

    // Clean up
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [adminAEmail, userOrgBEmail, ...[1, 2, 3, 4, 5].map((i) => `staff${i}.p56@example.com`)] }
    }).setOptions({ skipTenantPlugin: true });

    // Setup Tenant A
    const orgA = await Organization.create({ name: 'Bulk Org A P56', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Manager Role P56',
      isSuperAdmin: false,
      permissions: {
        attendance: {
          manage: { allowed: true, scope: 'everything' }
        }
      }
    });

    const adminA = await User.create({
      tenantId: orgAId,
      name: 'Admin Alice P56',
      username: 'alice_admin_p56',
      email: adminAEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    adminAId = adminA._id as mongoose.Types.ObjectId;

    // Create 5 staff members in Tenant A
    staffIds = [];
    for (let i = 1; i <= 5; i++) {
      const staff = await User.create({
        tenantId: orgAId,
        name: `Staff Member ${i} P56`,
        username: `staff${i}_p56`,
        email: `staff${i}.p56@example.com`,
        password: 'password123',
        roleId: roleA._id,
        isActive: true
      });
      staffIds.push(staff._id as mongoose.Types.ObjectId);
    }

    // Setup Tenant B
    const orgB = await Organization.create({ name: 'Bulk Org B P56', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Role B P56',
      isSuperAdmin: false,
      permissions: {}
    });

    const userB = await User.create({
      tenantId: orgBId,
      name: 'Staff Foreign Org B',
      username: 'foreign_b_p56',
      email: userOrgBEmail,
      password: 'password123',
      roleId: roleB._id,
      isActive: true
    });
    userOrgBId = userB._id as mongoose.Types.ObjectId;

    // Login Admin A
    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminAEmail, password: 'password123' });
    tokenA = loginA.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    await Attendance.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({
      skipTenantPlugin: true
    });
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [adminAEmail, userOrgBEmail, ...[1, 2, 3, 4, 5].map((i) => `staff${i}.p56@example.com`)] }
    }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({
      skipTenantPlugin: true
    });
  });

  it('1. should bulk mark 5 employees as Leave in a single atomic database batch', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/bulk')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userIds: staffIds.map((id) => id.toString()),
        date: testDate,
        status: 'Leave',
        notes: 'Annual firm retreat / office closed'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      date: testDate,
      status: 'Leave',
      affectedCount: 5,
      upsertedCount: 5,
      modifiedCount: 0
    });

    // Verify all 5 records exist in database
    const records = await Attendance.find({
      tenantId: orgAId,
      userId: { $in: staffIds },
      date: testDate
    });
    expect(records.length).toBe(5);
    for (const record of records) {
      expect(record.status).toBe('Leave');
      expect(record.markedBy.toString()).toBe(adminAId.toString());
      expect(record.notes).toBe('Annual firm retreat / office closed');
      expect(record.totalMinutes).toBe(0);
    }
  });

  it('2. should bulk update existing records and upsert any missing in a single bulkWrite', async () => {
    // 2 staff members already have records from test 1; let's change all 5 to "Holiday"
    const res = await request(app)
      .post('/api/v1/attendance/bulk')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userIds: staffIds.map((id) => id.toString()),
        date: testDate,
        status: 'Holiday',
        notes: 'Declared national festival closure'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('Holiday');
    expect(res.body.data.affectedCount).toBe(5);
    expect(res.body.data.modifiedCount).toBe(5);
    expect(res.body.data.upsertedCount).toBe(0);

    const records = await Attendance.find({
      tenantId: orgAId,
      userId: { $in: staffIds },
      date: testDate
    });
    expect(records.length).toBe(5);
    for (const record of records) {
      expect(record.status).toBe('Holiday');
      expect(record.notes).toBe('Declared national festival closure');
    }
  });

  it('3. should reject bulk action if any employee does not belong to the tenant', async () => {
    // Mix 4 valid Org A staff with 1 foreign Org B user
    const mixedUserIds = [
      staffIds[0].toString(),
      staffIds[1].toString(),
      staffIds[2].toString(),
      staffIds[3].toString(),
      userOrgBId.toString()
    ];

    const res = await request(app)
      .post('/api/v1/attendance/bulk')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userIds: mixedUserIds,
        date: testDate,
        status: 'Leave'
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_EMPLOYEE_SELECTION');
  });

  it('4. should reject validation errors (empty user list, bad date format, invalid status)', async () => {
    // Empty userIds
    const res1 = await request(app)
      .post('/api/v1/attendance/bulk')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userIds: [],
        date: testDate,
        status: 'Leave'
      });
    expect(res1.status).toBe(400);

    // Invalid ObjectId inside userIds
    const res2 = await request(app)
      .post('/api/v1/attendance/bulk')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userIds: ['invalid-object-id'],
        date: testDate,
        status: 'Leave'
      });
    expect(res2.status).toBe(400);

    // Invalid date format
    const res3 = await request(app)
      .post('/api/v1/attendance/bulk')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userIds: [staffIds[0].toString()],
        date: '23-10-2026',
        status: 'Leave'
      });
    expect(res3.status).toBe(400);

    // Invalid status
    const res4 = await request(app)
      .post('/api/v1/attendance/bulk')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        userIds: [staffIds[0].toString()],
        date: testDate,
        status: 'OnVacation'
      });
    expect(res4.status).toBe(400);
  });

  it('5. should reject unauthenticated request with 401', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/bulk')
      .send({
        userIds: [staffIds[0].toString()],
        date: testDate,
        status: 'Leave'
      });

    expect(res.status).toBe(401);
  });
});
