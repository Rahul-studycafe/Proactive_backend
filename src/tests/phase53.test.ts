import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Attendance } from '../models/Attendance';
import { TenantSettings } from '../modules/masters/schemas/tenant-settings.schema';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 11: Phase 53 — Self-Service Check-In & Check-Out API', () => {
  let orgAId: mongoose.Types.ObjectId;
  let user1Id: mongoose.Types.ObjectId;
  let user2Id: mongoose.Types.ObjectId;
  let token1: string;
  let token2: string;

  const orgASlug = 'att-self-orga-p53';
  const user1Email = 'staff1.p53@example.com';
  const user2Email = 'staff2.p53@example.com';

  beforeAll(async () => {
    await connectDB();
    await Attendance.init();

    // Cleanup previous test state
    await Organization.deleteMany({ slug: orgASlug });
    await User.deleteMany({ email: { $in: [user1Email, user2Email] } }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({ name: 'Self-Service Org A P53', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    // Set standard working hours to 8.5 hours (510 minutes)
    await TenantSettings.create({
      tenantId: orgAId,
      workingDays: {
        weekends: ['Sunday'],
        standardWorkHoursPerDay: 8.5
      }
    });

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Staff',
      isSuperAdmin: false,
      permissions: {}
    });

    const user1 = await User.create({
      tenantId: orgAId,
      name: 'Staff Member 1',
      username: 'staff1_p53',
      email: user1Email,
      password: 'password123',
      roleId: roleA._id
    });
    user1Id = user1._id as mongoose.Types.ObjectId;

    const user2 = await User.create({
      tenantId: orgAId,
      name: 'Staff Member 2',
      username: 'staff2_p53',
      email: user2Email,
      password: 'password123',
      roleId: roleA._id
    });
    user2Id = user2._id as mongoose.Types.ObjectId;

    const login1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user1Email, password: 'password123' });
    token1 = login1.body.data.accessToken;

    const login2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user2Email, password: 'password123' });
    token2 = login2.body.data.accessToken;
  });

  afterAll(async () => {
    await Attendance.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await TenantSettings.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteMany({ slug: orgASlug });
    await User.deleteMany({ email: { $in: [user1Email, user2Email] } }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  describe('1. Check-Out before Check-In Guard', () => {
    it('should reject check-out if user has not checked in today', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${token1}`)
        .send({ date: '2026-10-22' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_CHECKED_IN');
    });
  });

  describe('2. POST /api/v1/attendance/check-in', () => {
    it('should clock in successfully for today', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          date: '2026-10-22',
          timestamp: '2026-10-22T09:00:00Z',
          notes: 'Clocking in on time'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Present');
      expect(res.body.data.checkIn).toBeDefined();
      expect(res.body.data.userId.toString()).toBe(user1Id.toString());
      expect(res.body.data.markedBy.toString()).toBe(user1Id.toString());
      expect(res.body.data.notes).toBe('Clocking in on time');
    });

    it('should reject second check-in attempt on the same day', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          date: '2026-10-22',
          timestamp: '2026-10-22T09:15:00Z'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ALREADY_CHECKED_IN');
    });

    it('should allow user2 to check in independently on the same date', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${token2}`)
        .send({
          date: '2026-10-22',
          timestamp: '2026-10-22T09:30:00Z'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.userId.toString()).toBe(user2Id.toString());
    });
  });

  describe('3. POST /api/v1/attendance/check-out (Full Day & Overtime calculation)', () => {
    it('should clock out at 18:00 UTC (9 hrs = 540 mins) with Present status and 30m overtime', async () => {
      // Checked in at 09:00 UTC, checking out at 18:00 UTC (9 hours)
      // Standard = 8.5h (510m), Overtime = 30m
      const res = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          date: '2026-10-22',
          timestamp: '2026-10-22T18:00:00Z',
          notes: 'Completed all client tasks'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Present');
      expect(res.body.data.totalMinutes).toBe(540);
      expect(res.body.data.overtimeMinutes).toBe(30);
      expect(res.body.data.checkOut).toBeDefined();
    });

    it('should reject subsequent check-out attempt after already checked out', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          date: '2026-10-22',
          timestamp: '2026-10-22T18:30:00Z'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ALREADY_CHECKED_OUT');
    });
  });

  describe('4. POST /api/v1/attendance/check-out (Half Day transition for < 4 hours)', () => {
    it('should mark status as Half Day if totalMinutes < 240', async () => {
      // User2 checked in at 09:30 UTC, checking out at 12:30 UTC (3 hours = 180 mins)
      const res = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${token2}`)
        .send({
          date: '2026-10-22',
          timestamp: '2026-10-22T12:30:00Z',
          notes: 'Left early for doctor appointment'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Half Day');
      expect(res.body.data.totalMinutes).toBe(180);
      expect(res.body.data.overtimeMinutes).toBe(0);
    });
  });

  describe('5. GET /api/v1/attendance/today', () => {
    it('should return current attendance record for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/today?date=2026-10-22')
        .set('Authorization', `Bearer ${token1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.date).toBe('2026-10-22');
      expect(res.body.data.status).toBe('Present');
      expect(res.body.data.totalMinutes).toBe(540);
    });
  });
});
