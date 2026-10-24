import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { TenantSettings } from '../modules/masters/schemas/tenant-settings.schema';
import { Attendance } from '../models/Attendance';
import { AutomationLog } from '../models/AutomationLog';
import { Holiday } from '../models/Holiday';
import { generateAccessToken } from '../modules/auth/services/auth.service';
import { getRedisClient, closeRedisClient } from '../config/redis';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 2 Hardening: Skipped Items & Operational Safeguards', () => {
  let tenantId: mongoose.Types.ObjectId;
  let adminId: mongoose.Types.ObjectId;
  let staffId: mongoose.Types.ObjectId;
  let adminToken: string;
  let staffToken: string;

  const orgSlug = 'hardening-test-org';
  const adminEmail = 'admin.hardening@example.com';
  const staffEmail = 'staff.hardening@example.com';

  beforeAll(async () => {
    await connectDB();
    await Attendance.init();
    await AutomationLog.init();
    await TenantSettings.init();

    // Clean up test data
    await Organization.deleteMany({ slug: orgSlug });
    await User.deleteMany({ email: { $in: [adminEmail, staffEmail] } }).setOptions({ skipTenantPlugin: true });

    // 1. Create Organization
    const org = await Organization.create({
      name: 'Hardening Practice Firm',
      slug: orgSlug
    });
    tenantId = org._id as mongoose.Types.ObjectId;

    // 2. Create Roles
    const adminRole = await Role.create({
      tenantId,
      name: 'Hardening Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    const staffRole = await Role.create({
      tenantId,
      name: 'Hardening Staff',
      isSuperAdmin: false,
      permissions: {}
    });

    // 3. Create Users
    const adminUser = await User.create({
      tenantId,
      name: 'Admin Hardening User',
      username: 'admin_hardening',
      email: adminEmail,
      password: 'password123',
      roleId: adminRole._id,
      isActive: true
    });
    adminId = adminUser._id as mongoose.Types.ObjectId;

    const staffUser = await User.create({
      tenantId,
      name: 'Staff Hardening User',
      username: 'staff_hardening',
      email: staffEmail,
      password: 'password123',
      roleId: staffRole._id,
      isActive: true
    });
    staffId = staffUser._id as mongoose.Types.ObjectId;

    // 4. Generate Auth Tokens
    adminToken = generateAccessToken({
      userId: adminId.toString(),
      tenantId: tenantId.toString(),
      roleId: adminRole._id.toString(),
      tokenVersion: 0
    });

    staffToken = generateAccessToken({
      userId: staffId.toString(),
      tenantId: tenantId.toString(),
      roleId: staffRole._id.toString(),
      tokenVersion: 0
    });
  });

  afterAll(async () => {
    await Organization.deleteMany({ slug: orgSlug });
    await User.deleteMany({ tenantId }).setOptions({ skipTenantPlugin: true });
    await Attendance.deleteMany({ tenantId }).setOptions({ skipTenantPlugin: true });
    await TenantSettings.deleteMany({ tenantId }).setOptions({ skipTenantPlugin: true });
    await Holiday.deleteMany({ tenantId }).setOptions({ skipTenantPlugin: true });
    await AutomationLog.deleteMany({ tenantId }).setOptions({ skipTenantPlugin: true });
    await closeRedisClient();
    await mongoose.connection.close();
  });

  // --------------------------------------------------------------------------
  // 1. AUTOMATION LOG TTL INDEX
  // --------------------------------------------------------------------------
  it('1. AutomationLog should have a 90-day MongoDB TTL index on createdAt', async () => {
    const indexes = await AutomationLog.collection.indexes();
    const ttlIndex = indexes.find(
      (idx) => idx.key && idx.key.createdAt === 1 && idx.expireAfterSeconds !== undefined
    );

    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.expireAfterSeconds).toBe(90 * 24 * 60 * 60);
  });

  // --------------------------------------------------------------------------
  // 2. BULK ATTENDANCE CAP (MAX 250)
  // --------------------------------------------------------------------------
  it('2. Bulk attendance should reject payloads exceeding 250 employees with HTTP 400', async () => {
    // Generate 251 dummy ObjectIds
    const excessiveUserIds = Array.from({ length: 251 }, () => new mongoose.Types.ObjectId().toString());

    const res = await request(app)
      .post('/api/v1/attendance/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userIds: excessiveUserIds,
        date: '2026-10-22',
        status: 'Present'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Batch size cannot exceed 250 employees');
  });

  // --------------------------------------------------------------------------
  // 3. WEEKEND DAY NORMALIZER
  // --------------------------------------------------------------------------
  it('3. Working days update should normalize abbreviations and lowercase day names', async () => {
    const res = await request(app)
      .put('/api/v1/tenant-settings/work-days')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        weekends: ['sat', 'sun'],
        standardWorkHoursPerDay: 8
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.weekends).toEqual(['Saturday', 'Sunday']);
  });

  // --------------------------------------------------------------------------
  // 4. GPS GEOFENCING VALIDATION
  // --------------------------------------------------------------------------
  describe('4. GPS Geofencing Validation', () => {
    const officeLat = 28.6139; // New Delhi Connaught Place
    const officeLng = 77.2090;

    beforeAll(async () => {
      // Enable geofencing in tenant settings with 150m radius
      await TenantSettings.findOneAndUpdate(
        { tenantId },
        {
          officeLocation: {
            latitude: officeLat,
            longitude: officeLng,
            geofenceRadiusMeters: 150,
            enforceGeofence: true
          }
        },
        { upsert: true, new: true }
      );
    });

    afterAll(async () => {
      // Disable geofencing
      await TenantSettings.findOneAndUpdate(
        { tenantId },
        { 'officeLocation.enforceGeofence': false }
      );
    });

    it('rejects check-in without GPS coordinates when geofencing is enforced', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ notes: 'Punching without GPS' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('GEOFENCE_COORDINATES_REQUIRED');
    });

    it('rejects check-in with GPS coordinates outside the 150m office radius', async () => {
      // Point ~1.1km away (latitude + 0.01)
      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          latitude: officeLat + 0.01,
          longitude: officeLng,
          notes: 'Punching from home'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('OUTSIDE_GEOFENCE');
    });

    it('accepts check-in with GPS coordinates within the 150m office radius', async () => {
      // Point ~30m away
      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          latitude: officeLat + 0.0002,
          longitude: officeLng + 0.0002,
          notes: 'Punching at desk'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Present');
    });
  });

  // --------------------------------------------------------------------------
  // 5. STRICT DAY SHIFT ENFORCEMENT
  // --------------------------------------------------------------------------
  describe('5. Strict Day Shift Rules', () => {
    it('checks out successfully on the same day as check-in', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ notes: 'Done for the day' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checkOut).toBeDefined();
    });

    it('rejects a second check-out on the same day (ALREADY_CHECKED_OUT)', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${staffToken}`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ALREADY_CHECKED_OUT');
    });

    it('rejects check-out if user has not checked in today (NOT_CHECKED_IN)', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NOT_CHECKED_IN');
    });
  });

  // --------------------------------------------------------------------------
  // 6. MID-MONTH JOINING DATE PRORATION
  // --------------------------------------------------------------------------
  describe('6. Mid-Month Joining Date Proration', () => {
    let midJoinUser: any;

    beforeAll(async () => {
      // Employee who joined on April 16, 2026 (a 30-day month)
      midJoinUser = await User.create({
        tenantId,
        name: 'Mid Month Joiner',
        username: 'mid_joiner_p58',
        email: 'midjoiner@example.com',
        password: 'password123',
        roleId: staffId,
        isActive: true,
        joiningDate: new Date('2026-04-16T00:00:00Z')
      });

      // Configure Sunday-only weekends
      await TenantSettings.findOneAndUpdate(
        { tenantId },
        { 'workingDays.weekends': ['Sunday'] },
        { upsert: true }
      );

      // Create an official holiday on April 10 (BEFORE joining) and April 20 (AFTER joining)
      await Holiday.create([
        { tenantId, name: 'Pre-Joining Holiday', date: '2026-04-10', type: 'National' },
        { tenantId, name: 'Post-Joining Holiday', date: '2026-04-20', type: 'Festival' }
      ]);

      // Seed 5 present days for this user in April (April 16, 17, 18, 21, 22)
      await Attendance.create([
        { tenantId, userId: midJoinUser._id, date: '2026-04-16', status: 'Present', markedBy: adminId },
        { tenantId, userId: midJoinUser._id, date: '2026-04-17', status: 'Present', markedBy: adminId },
        { tenantId, userId: midJoinUser._id, date: '2026-04-18', status: 'Present', markedBy: adminId },
        { tenantId, userId: midJoinUser._id, date: '2026-04-21', status: 'Present', markedBy: adminId },
        { tenantId, userId: midJoinUser._id, date: '2026-04-22', status: 'Present', markedBy: adminId }
      ]);
    });

    it('prorates total days and only counts holidays on or after joining date', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/summary/${midJoinUser._id}?month=04&year=2026`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const summary = res.body.data;
      // In April 2026 (30 days), joining on April 16 gives 15 effective total days (April 16 to 30)
      expect(summary.totalDays).toBe(15);

      // Sundays on/after April 16 in April 2026: April 19, April 26 (2 Sundays)
      // Official holiday on/after April 16: April 20 (1 Holiday)
      // Total non-working days on/after April 16 = 2 Sundays + 1 Holiday = 3 days
      expect(summary.holidays).toBe(3);

      // Pre-joining holiday on April 10 must NOT be credited
      expect(summary.presentDays).toBe(5);
      // Payable days = 5 present + 3 holidays = 8
      expect(summary.payableDays).toBe(8);
    });
  });

  // --------------------------------------------------------------------------
  // 7. DASHBOARD OVERVIEW REDIS CACHING
  // --------------------------------------------------------------------------
  describe('7. Dashboard Overview Redis Caching', () => {
    it('retrieves overview and serves subsequent request from Redis cache', async () => {
      // First call computes and populates Redis cache
      const res1 = await request(app)
        .get('/api/v1/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.data.quickStats).toBeDefined();

      // Check that the key exists in Redis
      const redis = getRedisClient();
      if (redis) {
        const cached = await redis.get(`dashboard:overview:${tenantId.toString()}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          expect(parsed.quickStats.totalClients).toBe(res1.body.data.quickStats.totalClients);
        }
      }

      // Second call retrieves from cache
      const res2 = await request(app)
        .get('/api/v1/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.quickStats).toEqual(res1.body.data.quickStats);
    });
  });

  // --------------------------------------------------------------------------
  // 8. STATUTORY NATIONAL HOLIDAY SEED ENDPOINT
  // --------------------------------------------------------------------------
  describe('8. Statutory National Holiday Seed Endpoint', () => {
    it('seeds default statutory national holidays and is idempotent on repeat', async () => {
      const res1 = await request(app)
        .post('/api/v1/holidays/seed-default?year=2026&region=national')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 201]).toContain(res1.status);
      expect(res1.body.success).toBe(true);
      expect(res1.body.data.seededCount).toBe(5);

      // Verify holidays in DB
      const holidays = await Holiday.find({ tenantId, date: { $regex: '^2026' } });
      const names = holidays.map((h) => h.name);
      expect(names).toContain('Republic Day');
      expect(names).toContain('Independence Day');
      expect(names).toContain('Mahatma Gandhi Jayanti');
      expect(names).toContain('May Day');
      expect(names).toContain('Christmas');

      // Idempotency: repeating should not duplicate
      const res2 = await request(app)
        .post('/api/v1/holidays/seed-default?year=2026&region=national')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 201]).toContain(res2.status);
      const afterCount = await Holiday.countDocuments({ tenantId, date: { $regex: '^2026' } });
      expect(afterCount).toBe(holidays.length);
    });
  });

  // --------------------------------------------------------------------------
  // 9. ALTERNATE WEEKEND RULES (2nd & 4th Saturday Off)
  // --------------------------------------------------------------------------
  describe('9. Alternate Weekend Rules (2nd & 4th Saturday Off)', () => {
    it('persists alternate weekend rules and reflects them in attendance matrix & summary', async () => {
      const updateRes = await request(app)
        .put('/api/v1/tenant-settings/work-days')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          weekends: ['Sunday'],
          standardWorkHoursPerDay: 8,
          alternateWeekendRules: {
            day: 'Saturday',
            weeks: [2, 4]
          }
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.data.alternateWeekendRules).toEqual({
        day: 'Saturday',
        weeks: [2, 4]
      });

      // Verify in monthly attendance matrix for October 2026
      // October 2026:
      // Oct 1 = Thursday
      // Oct 3 = 1st Saturday (week 1, Math.ceil(3/7) = 1) -> NOT weekend
      // Oct 10 = 2nd Saturday (week 2, Math.ceil(10/7) = 2) -> IS weekend
      // Oct 17 = 3rd Saturday (week 3, Math.ceil(17/7) = 3) -> NOT weekend
      // Oct 24 = 4th Saturday (week 4, Math.ceil(24/7) = 4) -> IS weekend
      // Oct 31 = 5th Saturday (week 5, Math.ceil(31/7) = 5) -> NOT weekend
      const matrixRes = await request(app)
        .get('/api/v1/attendance/monthly?month=10&year=2026')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(matrixRes.status).toBe(200);
      const days = matrixRes.body.data.days;
      const day3 = days.find((d: any) => d.day === 3);
      const day10 = days.find((d: any) => d.day === 10);
      const day17 = days.find((d: any) => d.day === 17);
      const day24 = days.find((d: any) => d.day === 24);

      expect(day3.isWeekend).toBe(false);
      expect(day10.isWeekend).toBe(true);
      expect(day17.isWeekend).toBe(false);
      expect(day24.isWeekend).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 10. DEPARTMENT FILTERING ON MATRIX & ATTENDANCE OVERVIEW
  // --------------------------------------------------------------------------
  describe('10. Department Filtering on Matrix & Attendance Overview', () => {
    let deptAId: mongoose.Types.ObjectId;
    let deptBId: mongoose.Types.ObjectId;
    let deptStaffA: any;
    let deptStaffB: any;

    beforeAll(async () => {
      deptAId = new mongoose.Types.ObjectId();
      deptBId = new mongoose.Types.ObjectId();

      deptStaffA = await User.create({
        tenantId,
        name: 'Dept A Specialist',
        username: 'dept_a_user',
        email: 'depta@example.com',
        password: 'password123',
        roleId: adminId,
        departmentId: deptAId,
        isActive: true
      });

      deptStaffB = await User.create({
        tenantId,
        name: 'Dept B Specialist',
        username: 'dept_b_user',
        email: 'deptb@example.com',
        password: 'password123',
        roleId: adminId,
        departmentId: deptBId,
        isActive: true
      });

      // Mark Dept A staff Present on 2026-10-22
      await Attendance.create({
        tenantId,
        userId: deptStaffA._id,
        date: '2026-10-22',
        status: 'Present',
        markedBy: adminId
      });
    });

    it('filters monthly matrix by departmentId', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/monthly?month=10&year=2026&departmentId=${deptAId.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const staffList = res.body.data.staff;
      const userIds = staffList.map((s: any) => s._id.toString());
      expect(userIds).toContain(deptStaffA._id.toString());
      expect(userIds).not.toContain(deptStaffB._id.toString());
    });

    it('filters attendance overview analytics by departmentId', async () => {
      const resA = await request(app)
        .get(`/api/v1/analytics/attendance-overview?date=2026-10-22&departmentId=${deptAId.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data.totalStaff).toBe(1);
      expect(resA.body.data.presentToday).toBe(1);
      expect(resA.body.data.presenceRate).toBe(100);

      const resB = await request(app)
        .get(`/api/v1/analytics/attendance-overview?date=2026-10-22&departmentId=${deptBId.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.totalStaff).toBe(1);
      expect(resB.body.data.presentToday).toBe(0);
      expect(resB.body.data.presenceRate).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 11. STRICT DENY-BY-DEFAULT ATTENDANCE SBAC
  // --------------------------------------------------------------------------
  describe('11. Strict Deny-by-Default Attendance SBAC', () => {
    it('rejects staff with unconfigured role on attendance management endpoints', async () => {
      // staffToken role has permissions: {}
      const res1 = await request(app)
        .get('/api/v1/attendance/monthly?month=10&year=2026')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res1.status).toBe(403);
      expect(res1.body.success).toBe(false);
      expect(res1.body.error.code).toBe('FORBIDDEN');

      const res2 = await request(app)
        .post('/api/v1/attendance/bulk')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ userIds: [staffId.toString()], date: '2026-10-22', status: 'Present' });

      expect(res2.status).toBe(403);
      expect(res2.body.error.code).toBe('FORBIDDEN');
    });
  });

  // --------------------------------------------------------------------------
  // 12. STREAMING CSV EXPORT DIRECT PIPE
  // --------------------------------------------------------------------------
  describe('12. Streaming CSV Export Direct Pipe', () => {
    it('pipes CSV export stream directly to response with attachment headers', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/export?month=10&year=2026')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="attendance-export-2026-10.csv"/);
      expect(res.text).toContain('Employee Name,Username,Present,Half Day,Absent,Paid Leave,Payable Days,Overtime (Hrs)');
    });
  });
});
