import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Attendance } from '../models/Attendance';
import { generateAccessToken } from '../modules/auth/services/auth.service';
import dotenv from 'dotenv';

dotenv.config();

jest.setTimeout(30000);

describe('Part 12: Phase 59 — Attendance Permissions & SBAC Control API', () => {
  let orgAId: mongoose.Types.ObjectId;
  let managerId: mongoose.Types.ObjectId;
  let selfStaff1Id: mongoose.Types.ObjectId;
  let selfStaff2Id: mongoose.Types.ObjectId;
  let superAdminId: mongoose.Types.ObjectId;

  let managerToken: string;
  let selfStaff1Token: string;
  let selfStaff2Token: string;
  let superAdminToken: string;

  const orgASlug = 'att-sbac-orga-p59';
  const managerEmail = 'manager.p59@example.com';
  const selfStaff1Email = 'self1.p59@example.com';
  const selfStaff2Email = 'self2.p59@example.com';
  const superAdminEmail = 'superadmin.p59@example.com';

  beforeAll(async () => {
    await connectDB();
    await Attendance.init();

    // Clean up
    await Organization.deleteMany({ slug: orgASlug });
    await User.deleteMany({
      email: { $in: [managerEmail, selfStaff1Email, selfStaff2Email, superAdminEmail] }
    }).setOptions({ skipTenantPlugin: true });

    // Setup Tenant A
    const orgA = await Organization.create({ name: 'SBAC Org A P59', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    // Role 1: Manager Role (attendance.manage: allowed)
    const managerRole = await Role.create({
      tenantId: orgAId,
      name: 'Attendance Manager Role P59',
      isSuperAdmin: false,
      permissions: {
        attendance: {
          manage: { allowed: true, scope: 'everything' },
          view_self: { allowed: true, scope: 'everything' },
          view: { allowed: true, scope: 'everything' }
        }
      }
    });

    // Role 2: Self Staff Role (attendance.view_self: allowed, manage: false)
    const selfRole = await Role.create({
      tenantId: orgAId,
      name: 'Attendance Self Role P59',
      isSuperAdmin: false,
      permissions: {
        attendance: {
          manage: { allowed: false, scope: 'everything' },
          view_self: { allowed: true, scope: 'assigned_only' },
          view: { allowed: false, scope: 'everything' }
        }
      }
    });

    // Role 3: SuperAdmin Role
    const superAdminRole = await Role.create({
      tenantId: orgAId,
      name: 'SuperAdmin Role P59',
      isSuperAdmin: true,
      permissions: {}
    });

    // Create Users
    const manager = await User.create({
      tenantId: orgAId,
      name: 'Manager Mary',
      username: 'manager_mary_p59',
      email: managerEmail,
      password: 'password123',
      roleId: managerRole._id,
      isActive: true
    });
    managerId = manager._id as mongoose.Types.ObjectId;

    const selfStaff1 = await User.create({
      tenantId: orgAId,
      name: 'Self Staff John',
      username: 'self_john_p59',
      email: selfStaff1Email,
      password: 'password123',
      roleId: selfRole._id,
      isActive: true
    });
    selfStaff1Id = selfStaff1._id as mongoose.Types.ObjectId;

    const selfStaff2 = await User.create({
      tenantId: orgAId,
      name: 'Colleague Clara',
      username: 'colleague_clara_p59',
      email: selfStaff2Email,
      password: 'password123',
      roleId: selfRole._id,
      isActive: true
    });
    selfStaff2Id = selfStaff2._id as mongoose.Types.ObjectId;

    const superAdmin = await User.create({
      tenantId: orgAId,
      name: 'Super Admin Sam',
      username: 'super_sam_p59',
      email: superAdminEmail,
      password: 'password123',
      roleId: superAdminRole._id,
      isActive: true
    });
    superAdminId = superAdmin._id as mongoose.Types.ObjectId;

    // Generate tokens directly for high performance
    managerToken = generateAccessToken({
      userId: managerId.toString(),
      tenantId: orgAId.toString(),
      roleId: managerRole._id.toString(),
      tokenVersion: manager.tokenVersion || 0
    });

    selfStaff1Token = generateAccessToken({
      userId: selfStaff1Id.toString(),
      tenantId: orgAId.toString(),
      roleId: selfRole._id.toString(),
      tokenVersion: selfStaff1.tokenVersion || 0
    });

    selfStaff2Token = generateAccessToken({
      userId: selfStaff2Id.toString(),
      tenantId: orgAId.toString(),
      roleId: selfRole._id.toString(),
      tokenVersion: selfStaff2.tokenVersion || 0
    });

    superAdminToken = generateAccessToken({
      userId: superAdminId.toString(),
      tenantId: orgAId.toString(),
      roleId: superAdminRole._id.toString(),
      tokenVersion: superAdmin.tokenVersion || 0
    });
  });

  afterAll(async () => {
    await Attendance.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteMany({ slug: orgASlug });
    await User.deleteMany({
      email: { $in: [managerEmail, selfStaff1Email, selfStaff2Email, superAdminEmail] }
    }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  describe('1. Self Scope Guarded Endpoints (HTTP 403 Checks)', () => {
    it('should return 403 when User with Self scope attempts POST /api/v1/attendance/mark for a colleague', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/mark')
        .set('Authorization', `Bearer ${selfStaff1Token}`)
        .send({
          userId: selfStaff2Id.toString(),
          date: '2026-10-22',
          status: 'Present'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toMatch(/permission/i);
    });

    it('should return 403 when User with Self scope attempts POST /api/v1/attendance/bulk', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/bulk')
        .set('Authorization', `Bearer ${selfStaff1Token}`)
        .send({
          userIds: [selfStaff1Id.toString(), selfStaff2Id.toString()],
          date: '2026-10-22',
          status: 'Present'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 403 when User with Self scope attempts GET /api/v1/attendance/daily', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/daily?date=2026-10-22')
        .set('Authorization', `Bearer ${selfStaff1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 403 when User with Self scope attempts GET /api/v1/attendance/monthly', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/monthly?month=10&year=2026')
        .set('Authorization', `Bearer ${selfStaff1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 403 when User with Self scope attempts GET /api/v1/attendance/summary/:colleagueId', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/summary/${selfStaff2Id.toString()}?month=10&year=2026`)
        .set('Authorization', `Bearer ${selfStaff1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('2. Self Scope Allowed Endpoints (HTTP 200/201 Checks)', () => {
    it('should allow User with Self scope to check in and view own today status', async () => {
      const checkInRes = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${selfStaff1Token}`)
        .send({
          date: '2026-10-22',
          timestamp: '2026-10-22T09:00:00Z'
        });

      expect([200, 201]).toContain(checkInRes.status);
      expect(checkInRes.body.success).toBe(true);

      const todayRes = await request(app)
        .get('/api/v1/attendance/today')
        .set('Authorization', `Bearer ${selfStaff1Token}`);

      expect(todayRes.status).toBe(200);
      expect(todayRes.body.success).toBe(true);
      expect(todayRes.body.data.status).toBe('Present');
      expect(todayRes.body.data.checkIn).toBeDefined();
    });

    it('should allow User with Self scope to view their OWN summary via /summary/:ownId', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/summary/${selfStaff1Id.toString()}?month=10&year=2026`)
        .set('Authorization', `Bearer ${selfStaff1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe(selfStaff1Id.toString());
      expect(res.body.data.payableDays).toBeGreaterThanOrEqual(0);
    });
  });

  describe('3. Manager Scope Endpoints (attendance.manage: allowed)', () => {
    it('should allow Manager to mark attendance for any employee', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/mark')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          userId: selfStaff2Id.toString(),
          date: '2026-10-22',
          status: 'Present',
          checkIn: '2026-10-22T09:00:00Z',
          checkOut: '2026-10-22T17:30:00Z'
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Present');
      expect(res.body.data.markedBy.toString()).toBe(managerId.toString());
    });

    it('should allow Manager to trigger bulk attendance updates', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/bulk')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          userIds: [selfStaff1Id.toString(), selfStaff2Id.toString()],
          date: '2026-10-23',
          status: 'Paid Leave',
          notes: 'Company-wide paid leave'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.affectedCount).toBe(2);
    });

    it('should allow Manager to view daily roster and monthly grid', async () => {
      const dailyRes = await request(app)
        .get('/api/v1/attendance/daily?date=2026-10-22')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(dailyRes.status).toBe(200);
      expect(dailyRes.body.success).toBe(true);

      const monthlyRes = await request(app)
        .get('/api/v1/attendance/monthly?month=10&year=2026')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(monthlyRes.status).toBe(200);
      expect(monthlyRes.body.success).toBe(true);
      expect(Number(monthlyRes.body.data.month)).toBe(10);
    });

    it('should allow Manager to view summary of any employee', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/summary/${selfStaff2Id.toString()}?month=10&year=2026`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe(selfStaff2Id.toString());
    });
  });

  describe('4. SuperAdmin Role Bypass Checks', () => {
    it('should allow SuperAdmin to access all attendance endpoints without explicit permissions', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/daily?date=2026-10-22')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
