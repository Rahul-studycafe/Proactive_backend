import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { TenantSettings } from '../modules/masters/schemas/tenant-settings.schema';
import { Attendance } from '../models/Attendance';
import { isIpInWhitelist } from '../utils/ip-matcher';
import {
  checkInService,
  getMonthlyMatrixService,
  getStaffAttendanceSummaryService
} from '../services/attendance.service';
import dotenv from 'dotenv';

dotenv.config();

describe('Dual-Mode Office IP Whitelist & Mid-Month Joinee Proration Tests', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminId: mongoose.Types.ObjectId;
  let joineeId: mongoose.Types.ObjectId;
  let adminToken: string;
  let joineeToken: string;

  const orgSlug = 'dualmode-prorate-test-org';
  const adminEmail = 'admin.dualmode@example.com';
  const joineeEmail = 'joinee.dualmode@example.com';

  beforeAll(async () => {
    await connectDB();
    await Attendance.init();

    // Clean up
    await Organization.deleteMany({ slug: orgSlug });
    await User.deleteMany({ email: { $in: [adminEmail, joineeEmail] } }).setOptions({
      skipTenantPlugin: true
    });

    // Create organization
    const org = await Organization.create({
      name: 'DualMode & Proration Org',
      slug: orgSlug
    });
    orgId = org._id as mongoose.Types.ObjectId;

    // Create Admin role
    const adminRole = await Role.create({
      tenantId: orgId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });

    // Create Admin user
    const admin = await User.create({
      tenantId: orgId,
      name: 'Admin DualMode',
      username: 'admin_dualmode',
      email: adminEmail,
      password: 'password123',
      roleId: adminRole._id
    });
    adminId = admin._id as mongoose.Types.ObjectId;

    // Create Mid-Month Joinee (joining on 15th of the month)
    const joinee = await User.create({
      tenantId: orgId,
      name: 'Mid-Month Joinee',
      username: 'joinee_oct15',
      email: joineeEmail,
      password: 'password123',
      roleId: adminRole._id,
      joiningDate: new Date('2026-10-15T00:00:00.000Z')
    });
    joineeId = joinee._id as mongoose.Types.ObjectId;

    // Login Admin
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'password123' });
    adminToken = loginRes.body.data.accessToken;

    // Login Joinee
    const joineeLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: joineeEmail, password: 'password123' });
    joineeToken = joineeLoginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await Attendance.deleteMany({ tenantId: orgId });
    await TenantSettings.deleteMany({ tenantId: orgId });
    await User.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId });
    await Organization.deleteMany({ _id: orgId });
    await mongoose.connection.close();
  });

  describe('1. IP Whitelist Matcher Utility (Unit)', () => {
    it('should correctly match exact IPv4 addresses', () => {
      const whitelist = ['203.0.113.10', '198.51.100.5'];
      expect(isIpInWhitelist('203.0.113.10', whitelist)).toBe(true);
      expect(isIpInWhitelist('203.0.113.11', whitelist)).toBe(false);
    });

    it('should match CIDR blocks correctly', () => {
      const whitelist = ['192.168.1.0/24'];
      expect(isIpInWhitelist('192.168.1.1', whitelist)).toBe(true);
      expect(isIpInWhitelist('192.168.1.254', whitelist)).toBe(true);
      expect(isIpInWhitelist('192.168.2.1', whitelist)).toBe(false);
    });

    it('should strip IPv6-mapped IPv4 prefix (::ffff:)', () => {
      const whitelist = ['10.0.0.0/8'];
      expect(isIpInWhitelist('::ffff:10.5.20.1', whitelist)).toBe(true);
      expect(isIpInWhitelist('::ffff:172.16.0.1', whitelist)).toBe(false);
    });

    it('should auto-allow loopback addresses for local dev', () => {
      expect(isIpInWhitelist('127.0.0.1', ['203.0.113.0/24'])).toBe(true);
      expect(isIpInWhitelist('::1', ['203.0.113.0/24'])).toBe(true);
    });
  });

  describe('2. Tenant Settings - Office Perimeter & My IP API', () => {
    it('GET /api/v1/tenant-settings/my-ip returns the client IP', async () => {
      const res = await request(app)
        .get('/api/v1/tenant-settings/my-ip')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('ip');
      expect(res.body.data).toHaveProperty('normalizedIp');
    });

    it('PUT /api/v1/tenant-settings/work-days configures dual-mode office perimeter', async () => {
      const res = await request(app)
        .put('/api/v1/tenant-settings/work-days')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          weekends: ['Sunday'],
          standardWorkHoursPerDay: 8.5,
          officePerimeter: {
            enableIpWhitelist: true,
            ipWhitelist: ['198.51.100.0/24', '203.0.113.50'],
            enforceGeofence: true,
            latitude: 12.9716,
            longitude: 77.5946,
            geofenceRadiusMeters: 200
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.officePerimeter.enableIpWhitelist).toBe(true);
      expect(res.body.data.officePerimeter.ipWhitelist).toContain('198.51.100.0/24');
      expect(res.body.data.officePerimeter.enforceGeofence).toBe(true);
      expect(res.body.data.officePerimeter.geofenceRadiusMeters).toBe(200);
    });
  });

  describe('3. Dual-Mode Attendance Check-In Verification', () => {
    it('allows check-in without GPS if client IP matches office whitelist', async () => {
      // Check in joinee via office IP (198.51.100.77 matches 198.51.100.0/24)
      const res = await checkInService(orgId, joineeId, {
        date: '2026-10-23',
        clientIp: '198.51.100.77'
        // No latitude / longitude provided!
      });

      expect(res).toBeDefined();
      expect(res.status).toBe('Present');
      expect(res.verifiedVia).toBe('office_ip');
      expect(res.ipAddress).toBe('198.51.100.77');
    });

    it('rejects check-in if IP is outside whitelist and GPS coordinates are missing', async () => {
      const outsideIp = '104.28.16.4';
      await expect(
        checkInService(orgId, adminId, {
          date: '2026-10-24',
          clientIp: outsideIp
          // No GPS coordinates
        })
      ).rejects.toThrow('Not on office Wi-Fi / IP (104.28.16.4)');
    });

    it('rejects check-in if IP is outside whitelist and GPS coordinates are outside geofence', async () => {
      const outsideIp = '104.28.16.4';
      // Far away coordinates (e.g. lat 13.5, lon 78.5 is ~80km away)
      await expect(
        checkInService(orgId, adminId, {
          date: '2026-10-25',
          clientIp: outsideIp,
          latitude: 13.5,
          longitude: 78.5
        })
      ).rejects.toThrow('Outside office perimeter');
    });

    it('allows check-in if IP is outside whitelist but GPS is within geofence radius', async () => {
      const outsideIp = '104.28.16.4';
      // Within ~20 meters of office (12.9716, 77.5946)
      const entry = await checkInService(orgId, adminId, {
        date: '2026-10-26',
        clientIp: outsideIp,
        latitude: 12.97165,
        longitude: 77.59465
      });

      expect(entry).toBeDefined();
      expect(entry.status).toBe('Present');
      expect(entry.verifiedVia).toBe('gps');
      expect(entry.ipAddress).toBe(outsideIp);
    });
  });

  describe('4. Mid-Month Joinee 31-Day Matrix & Summary Proration', () => {
    it('marks pre-joining dates with status "N/A" and isPreJoining: true in Monthly Matrix', async () => {
      const matrixResult = await getMonthlyMatrixService(orgId, '10', '2026');

      expect(matrixResult).toBeDefined();
      expect(matrixResult.month).toBe('10');
      expect(matrixResult.year).toBe('2026');
      expect(matrixResult.daysInMonth).toBe(31);

      const joineeStaff = matrixResult.staff.find(
        (s) => s._id.toString() === joineeId.toString()
      );
      expect(joineeStaff).toBeDefined();
      expect(joineeStaff?.joiningDate).toBe('2026-10-15');

      // October 1 to October 14 should be marked as pre-joining N/A
      const joineeMatrix = matrixResult.matrix[joineeId.toString()];
      expect(joineeMatrix).toBeDefined();

      for (let day = 1; day <= 14; day++) {
        const cell = joineeMatrix[day];
        expect(cell).toBeDefined();
        expect(cell.status).toBe('N/A');
        expect(cell.isPreJoining).toBe(true);
        expect(cell.notes).toContain('Joined on 2026-10-15');
      }

      // Day 23 was checked in as Present
      expect(joineeMatrix[23]).toBeDefined();
      expect(joineeMatrix[23].status).toBe('Present');
    });

    it('prorates payable days and total active days in getStaffAttendanceSummaryService', async () => {
      const summary = await getStaffAttendanceSummaryService(orgId, joineeId, '10', '2026');

      expect(summary).toBeDefined();
      expect(summary.isProrated).toBe(true);
      expect(summary.totalDays).toBe(31);
      expect(summary.preJoiningDays).toBe(14);
      // Effective total days = 31 - 14 = 17 days
      expect(summary.effectiveTotalDays).toBe(17);
      expect(summary.joiningDate).toBe('2026-10-15');
      expect(summary.presentDays).toBe(1); // Checked in on the 23rd
      expect(summary.payableDays).toBeGreaterThanOrEqual(1);
    });
  });
});
