import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Holiday } from '../models/Holiday';
import { Attendance } from '../models/Attendance';
import { TenantSettings } from '../modules/masters/schemas/tenant-settings.schema';
import { generateAccessToken } from '../modules/auth/services/auth.service';
import dotenv from 'dotenv';

dotenv.config();

jest.setTimeout(30000);

describe('Part 12: Phase 60 — Attendance Export Service (CSV/Excel) API', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let managerId: mongoose.Types.ObjectId;
  let staff1Id: mongoose.Types.ObjectId;
  let staff2Id: mongoose.Types.ObjectId;
  let staffBId: mongoose.Types.ObjectId;

  let managerToken: string;
  let staff1Token: string;

  const orgASlug = 'att-export-orga-p60';
  const orgBSlug = 'att-export-orgb-p60';
  const managerEmail = 'manager.p60@example.com';
  const staff1Email = 'alice.p60@example.com';
  const staff2Email = 'bob.p60@example.com';
  const staffBEmail = 'eve.p60@example.com';

  const testYear = '2026';
  const testMonth = '04';

  beforeAll(async () => {
    await connectDB();
    await Attendance.init();
    await Holiday.init();

    // Clean up
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [managerEmail, staff1Email, staff2Email, staffBEmail] }
    }).setOptions({ skipTenantPlugin: true });
    await Holiday.deleteMany({
      date: { $in: ['2026-04-10', '2026-04-14', '2026-04-17', '2026-04-21'] }
    }).setOptions({ skipTenantPlugin: true });

    // Setup Tenant A
    const orgA = await Organization.create({ name: 'Export Org A P60', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    // Tenant A Settings: Sunday weekend, 8.5 standard hours
    await TenantSettings.create({
      tenantId: orgAId,
      workingDays: {
        weekends: ['Sunday'],
        standardWorkHoursPerDay: 8.5
      }
    });

    // Roles for Tenant A
    const managerRole = await Role.create({
      tenantId: orgAId,
      name: 'Manager Role P60',
      isSuperAdmin: false,
      permissions: {
        attendance: {
          manage: { allowed: true, scope: 'everything' },
          view_self: { allowed: true, scope: 'everything' },
          view: { allowed: true, scope: 'everything' }
        }
      }
    });

    const staffRole = await Role.create({
      tenantId: orgAId,
      name: 'Staff Self Role P60',
      isSuperAdmin: false,
      permissions: {
        attendance: {
          manage: { allowed: false, scope: 'everything' },
          view_self: { allowed: true, scope: 'assigned_only' },
          view: { allowed: false, scope: 'everything' }
        }
      }
    });

    // Users in Tenant A
    const manager = await User.create({
      tenantId: orgAId,
      name: 'HR Manager Mark',
      username: 'mark_p60',
      email: managerEmail,
      password: 'password123',
      roleId: managerRole._id,
      isActive: true
    });
    managerId = manager._id as mongoose.Types.ObjectId;

    const staff1 = await User.create({
      tenantId: orgAId,
      name: 'Alice Smith',
      username: 'alice_p60',
      email: staff1Email,
      password: 'password123',
      roleId: staffRole._id,
      isActive: true
    });
    staff1Id = staff1._id as mongoose.Types.ObjectId;

    const staff2 = await User.create({
      tenantId: orgAId,
      name: 'Bob, Jr. "The Accountant"',
      username: 'bob_p60',
      email: staff2Email,
      password: 'password123',
      roleId: staffRole._id,
      isActive: true
    });
    staff2Id = staff2._id as mongoose.Types.ObjectId;

    // Setup Tenant B & Foreign User
    const orgB = await Organization.create({ name: 'Export Org B P60', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Role B P60',
      isSuperAdmin: false,
      permissions: {}
    });

    const staffB = await User.create({
      tenantId: orgBId,
      name: 'Eve Foreign Staff Org B',
      username: 'eve_p60',
      email: staffBEmail,
      password: 'password123',
      roleId: roleB._id,
      isActive: true
    });
    staffBId = staffB._id as mongoose.Types.ObjectId;

    // Tokens
    managerToken = generateAccessToken({
      userId: managerId.toString(),
      tenantId: orgAId.toString(),
      roleId: managerRole._id.toString(),
      tokenVersion: manager.tokenVersion || 0
    });

    staff1Token = generateAccessToken({
      userId: staff1Id.toString(),
      tenantId: orgAId.toString(),
      roleId: staffRole._id.toString(),
      tokenVersion: staff1.tokenVersion || 0
    });

    // Seed 4 official holidays in April 2026 (April has 4 Sundays + 4 holidays = 8 non-working days)
    await Holiday.create([
      { tenantId: orgAId, name: 'Good Friday', date: '2026-04-10', type: 'National' },
      { tenantId: orgAId, name: 'Ambedkar Jayanti', date: '2026-04-14', type: 'Festival' },
      { tenantId: orgAId, name: 'Office Holiday 1', date: '2026-04-17', type: 'Other' },
      { tenantId: orgAId, name: 'Office Holiday 2', date: '2026-04-21', type: 'Other' }
    ]);

    // Seed Alice (staff1):
    // 19 standard Present days
    const alicePresentDates = [
      '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04',
      '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09',
      '2026-04-11', '2026-04-13', '2026-04-15', '2026-04-16',
      '2026-04-18', '2026-04-20', '2026-04-22', '2026-04-23',
      '2026-04-24', '2026-04-27', '2026-04-28'
    ];

    const aliceDocs: any[] = alicePresentDates.map((date) => ({
      tenantId: orgAId,
      userId: staff1Id,
      date,
      status: 'Present',
      totalMinutes: 480,
      overtimeMinutes: 0,
      markedBy: managerId
    }));

    // 1 Overtime Present Day (120 mins = 2 hrs overtime)
    aliceDocs.push({
      tenantId: orgAId,
      userId: staff1Id,
      date: '2026-04-29',
      status: 'Present',
      totalMinutes: 630,
      overtimeMinutes: 120,
      markedBy: managerId
    });

    // 2 Half days
    aliceDocs.push(
      {
        tenantId: orgAId,
        userId: staff1Id,
        date: '2026-04-25',
        status: 'Half Day',
        totalMinutes: 200,
        overtimeMinutes: 0,
        markedBy: managerId
      },
      {
        tenantId: orgAId,
        userId: staff1Id,
        date: '2026-04-30',
        status: 'Half Day',
        totalMinutes: 180,
        overtimeMinutes: 0,
        markedBy: managerId
      }
    );

    // 1 Paid leave
    aliceDocs.push({
      tenantId: orgAId,
      userId: staff1Id,
      date: '2026-04-05', // on a Sunday, but let's test paid leave record
      status: 'Paid Leave',
      markedBy: managerId
    });

    await Attendance.create(aliceDocs);

    // Seed Bob (staff2):
    // 10 Present days, 3 Absent days, 0 overtime
    const bobPresentDates = [
      '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-06',
      '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-11', '2026-04-13'
    ];
    const bobDocs: any[] = bobPresentDates.map((date) => ({
      tenantId: orgAId,
      userId: staff2Id,
      date,
      status: 'Present',
      totalMinutes: 480,
      overtimeMinutes: 0,
      markedBy: managerId
    }));

    bobDocs.push(
      { tenantId: orgAId, userId: staff2Id, date: '2026-04-15', status: 'Absent', markedBy: managerId },
      { tenantId: orgAId, userId: staff2Id, date: '2026-04-16', status: 'Absent', markedBy: managerId },
      { tenantId: orgAId, userId: staff2Id, date: '2026-04-18', status: 'Absent', markedBy: managerId }
    );

    await Attendance.create(bobDocs);

    // Seed Eve in Tenant B
    await Attendance.create({
      tenantId: orgBId,
      userId: staffBId,
      date: '2026-04-01',
      status: 'Present',
      markedBy: staffBId
    });
  });

  afterAll(async () => {
    await Attendance.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await Holiday.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await TenantSettings.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [managerEmail, staff1Email, staff2Email, staffBEmail] }
    }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  describe('1. GET /api/v1/attendance/export Header & Format Verification', () => {
    it('should return 200 with text/csv content type and attachment filename', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/export?month=${testMonth}&year=${testYear}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="attendance-export-2026-04.csv"/);

      const lines = res.text.trim().split('\n');
      expect(lines[0]).toBe(
        'Employee Name,Username,Present,Half Day,Absent,Paid Leave,Payable Days,Overtime (Hrs)'
      );
    });
  });

  describe('2. Calculation & Escaping Accuracy', () => {
    it('should calculate accurate metrics for Alice and properly escape Bob with quotes/commas', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/export?month=${testMonth}&year=${testYear}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      const lines = res.text.trim().split('\n');
      // Line 0: Header
      // Sorted by name: Alice Smith, Bob..., HR Manager Mark
      const aliceLine = lines.find((l) => l.includes('alice_p60'));
      expect(aliceLine).toBeDefined();

      // Alice: 20 Present, 2 Half Day, 0 Absent, 1 Paid Leave, 30 Payable Days (20 + 1 + 1 + 8), 2 Overtime Hrs
      expect(aliceLine).toBe('Alice Smith,alice_p60,20,2,0,1,30,2');

      // Bob: Bob, Jr. "The Accountant" -> escaped as "Bob, Jr. ""The Accountant"""
      const bobLine = lines.find((l) => l.includes('bob_p60'));
      expect(bobLine).toBeDefined();
      // 10 Present, 0 Half Day, 3 Absent, 0 Paid Leave, 18 Payable Days (10 + 8), 0 Overtime Hrs
      expect(bobLine).toContain('"Bob, Jr. ""The Accountant""",bob_p60,10,0,3,0,18,0');
    });

    it('should enforce strict multi-tenant isolation and never leak Org B employees', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/export?month=${testMonth}&year=${testYear}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.text).not.toContain('eve_p60');
      expect(res.text).not.toContain('Eve Foreign');
    });
  });

  describe('3. Permission & SBAC Access Control', () => {
    it('should reject non-management staff (Self-only scope) with HTTP 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/export?month=${testMonth}&year=${testYear}`)
        .set('Authorization', `Bearer ${staff1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('4. Input Validation', () => {
    it('should return 400 when invalid month is passed', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/export?month=13&year=${testYear}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(['INVALID_MONTH', 'VALIDATION_FAILED']).toContain(res.body.error.code);
    });

    it('should return 400 when invalid year is passed', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/export?month=04&year=1890`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_YEAR');
    });
  });
});
