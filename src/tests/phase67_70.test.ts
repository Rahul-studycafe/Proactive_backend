import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { Task } from '../models/Task';
import { Attendance } from '../models/Attendance';
import { Holiday } from '../models/Holiday';
import { Service } from '../modules/services/schemas/service.schema';
import { generateAccessToken } from '../modules/auth/services/auth.service';
import dotenv from 'dotenv';

dotenv.config();

jest.setTimeout(35000);

describe('Part 14: Dynamic Visual Analytics & BI Aggregations (Phases 67–70)', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let adminId: mongoose.Types.ObjectId;
  let staffAId: mongoose.Types.ObjectId;
  let staffBId: mongoose.Types.ObjectId;
  let staffCId: mongoose.Types.ObjectId;
  let adminToken: string;

  const orgASlug = 'analytics-orga-p67-70';
  const orgBSlug = 'analytics-orgb-p67-70';
  const adminEmail = 'admin.p67@example.com';
  const staffAEmail = 'staffa.p67@example.com';
  const staffBEmail = 'staffb.p67@example.com';
  const staffCEmail = 'staffc.p67@example.com';

  const testDate = '2026-10-22';

  beforeAll(async () => {
    await connectDB();
    await Client.init();
    await Task.init();
    await Attendance.init();
    await Holiday.init();

    // Clean up
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [adminEmail, staffAEmail, staffBEmail, staffCEmail] }
    }).setOptions({ skipTenantPlugin: true });

    // 1. Setup Tenant A
    const orgA = await Organization.create({ name: 'Analytics Org A', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    // Setup Tenant B
    const orgB = await Organization.create({ name: 'Analytics Org B', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    // Roles
    const adminRole = await Role.create({
      tenantId: orgAId,
      name: 'Admin Role P67',
      isSuperAdmin: true,
      permissions: {}
    });

    const staffRole = await Role.create({
      tenantId: orgAId,
      name: 'Staff Role P67',
      isSuperAdmin: false,
      permissions: {}
    });

    // Users
    const adminUser = await User.create({
      tenantId: orgAId,
      name: 'Analytics Admin',
      username: 'admin_p67',
      email: adminEmail,
      password: 'password123',
      roleId: adminRole._id,
      isActive: true
    });
    adminId = adminUser._id as mongoose.Types.ObjectId;

    const staffA = await User.create({
      tenantId: orgAId,
      name: 'Alice Top Performer',
      username: 'alice_p67',
      email: staffAEmail,
      password: 'password123',
      roleId: staffRole._id,
      isActive: true
    });
    staffAId = staffA._id as mongoose.Types.ObjectId;

    const staffB = await User.create({
      tenantId: orgAId,
      name: 'Bob Average Performer',
      username: 'bob_p67',
      email: staffBEmail,
      password: 'password123',
      roleId: staffRole._id,
      isActive: true
    });
    staffBId = staffB._id as mongoose.Types.ObjectId;

    const staffC = await User.create({
      tenantId: orgAId,
      name: 'Charlie New Staff',
      username: 'charlie_p67',
      email: staffCEmail,
      password: 'password123',
      roleId: staffRole._id,
      isActive: true
    });
    staffCId = staffC._id as mongoose.Types.ObjectId;

    // Seed 6 additional staff in Tenant A to reach 10 active staff
    const extraStaffPromises = [];
    for (let i = 1; i <= 6; i++) {
      extraStaffPromises.push(
        User.create({
          tenantId: orgAId,
          name: `Staff Member ${i}`,
          username: `staff_${i}_p67`,
          email: `staff_${i}.p67@example.com`,
          password: 'password123',
          roleId: staffRole._id,
          isActive: true
        })
      );
    }
    const extraStaff = await Promise.all(extraStaffPromises);
    // Total staff in Tenant A = 1 admin + 3 named staff + 6 extra = 10 staff!

    adminToken = generateAccessToken({
      userId: adminId.toString(),
      tenantId: orgAId.toString(),
      roleId: adminRole._id.toString(),
      tokenVersion: adminUser.tokenVersion || 0
    });

    // 2. Seed Clients for Phase 67:
    // 10 Sole Proprietorships and 5 LLPs for Tenant A
    const clientDocsA = [];
    for (let i = 1; i <= 10; i++) {
      clientDocsA.push({
        tenantId: orgAId,
        name: `Proprietorship Client ${i}`,
        entityType: 'Sole Proprietorship',
        isActive: true
      });
    }
    for (let i = 1; i <= 5; i++) {
      clientDocsA.push({
        tenantId: orgAId,
        name: `LLP Client ${i}`,
        entityType: 'LLP',
        isActive: true
      });
    }
    await Client.create(clientDocsA);

    // Seed 2 Private Limited for Tenant B to verify tenant isolation
    await Client.create([
      { tenantId: orgBId, name: 'Tenant B Client 1', entityType: 'Private Limited', isActive: true },
      { tenantId: orgBId, name: 'Tenant B Client 2', entityType: 'Private Limited', isActive: true }
    ]);

    // 3. Seed Service & Tasks for Phase 68:
    const sampleService = await Service.create({
      tenantId: orgAId,
      name: 'Audit Service',
      isEnabled: true,
      defaultBillingRate: 5000,
      checklist: []
    });

    const dummyClient = await Client.findOne({ tenantId: orgAId });
    const dummyClientId = dummyClient!._id;

    // Staff A: 5 tasks (4 Completed, 1 In Progress) -> 80% completion
    const tasksStaffA = [
      { status: 'Completed', billingAmount: 1000 },
      { status: 'Completed', billingAmount: 1000 },
      { status: 'Completed', billingAmount: 1000 },
      { status: 'Completed', billingAmount: 1000 },
      { status: 'In Progress', billingAmount: 1000 }
    ].map((t) => ({
      tenantId: orgAId,
      clientId: dummyClientId,
      serviceId: sampleService._id,
      assigneeIds: [staffAId],
      status: t.status,
      billingAmount: t.billingAmount,
      isBillable: true,
      isBilled: false
    }));

    // Staff B: 5 tasks (2 Completed, 3 Pending) -> 40% completion
    const tasksStaffB = [
      { status: 'Completed', billingAmount: 1000 },
      { status: 'Completed', billingAmount: 1000 },
      { status: 'Pending', billingAmount: 1000 },
      { status: 'Pending', billingAmount: 1000 },
      { status: 'Pending', billingAmount: 1000 }
    ].map((t) => ({
      tenantId: orgAId,
      clientId: dummyClientId,
      serviceId: sampleService._id,
      assigneeIds: [staffBId],
      status: t.status,
      billingAmount: t.billingAmount,
      isBillable: true,
      isBilled: false
    }));

    await Task.create([...tasksStaffA, ...tasksStaffB]);

    // 4. Seed Attendance Records for Phase 69 (out of 10 staff):
    // 6 Present (admin, staffA, extraStaff[0], extraStaff[1], extraStaff[2], extraStaff[3])
    // 1 Half Day (staffB)
    // 1 Paid Leave (staffC)
    // 1 Absent (extraStaff[4])
    // 1 Unmarked (extraStaff[5])
    await Attendance.create([
      { tenantId: orgAId, userId: adminId, date: testDate, status: 'Present', markedBy: adminId },
      { tenantId: orgAId, userId: staffAId, date: testDate, status: 'Present', markedBy: adminId },
      { tenantId: orgAId, userId: extraStaff[0]._id, date: testDate, status: 'Present', markedBy: adminId },
      { tenantId: orgAId, userId: extraStaff[1]._id, date: testDate, status: 'Present', markedBy: adminId },
      { tenantId: orgAId, userId: extraStaff[2]._id, date: testDate, status: 'Present', markedBy: adminId },
      { tenantId: orgAId, userId: extraStaff[3]._id, date: testDate, status: 'Present', markedBy: adminId },
      { tenantId: orgAId, userId: staffBId, date: testDate, status: 'Half Day', markedBy: adminId },
      { tenantId: orgAId, userId: staffCId, date: testDate, status: 'Paid Leave', markedBy: adminId },
      { tenantId: orgAId, userId: extraStaff[4]._id, date: testDate, status: 'Absent', markedBy: adminId }
      // extraStaff[5] left unmarked
    ]);

    // 5. Seed upcoming holidays for Phase 70
    const todayStr = new Date().toISOString().split('T')[0];
    await Holiday.create([
      { tenantId: orgAId, name: 'Diwali Festival', date: '2026-11-08', type: 'Festival' },
      { tenantId: orgAId, name: 'Guru Nanak Jayanti', date: '2026-11-24', type: 'National' }
    ]);
  });

  afterAll(async () => {
    await Client.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await Task.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Attendance.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Holiday.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Service.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await User.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgAId }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await mongoose.connection.close();
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 67: Client Entity Distribution Aggregation
  // ─────────────────────────────────────────────────────────────
  describe('Phase 67: Client Entity Distribution Aggregation', () => {
    it('should aggregate clients by entity structure with correct counts and percentages', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/client-distribution')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);

      // Total clients in Tenant A: 15 (10 Sole Prop, 5 LLP)
      const soleProp = res.body.data.find(
        (item: any) => item.entityType === 'Sole Proprietorship'
      );
      expect(soleProp).toBeDefined();
      expect(soleProp.count).toBe(10);
      expect(soleProp.percentage).toBe(67); // Math.round(10/15 * 100) = 67%

      const llp = res.body.data.find((item: any) => item.entityType === 'LLP');
      expect(llp).toBeDefined();
      expect(llp.count).toBe(5);
      expect(llp.percentage).toBe(33); // Math.round(5/15 * 100) = 33%

      // Verify Tenant B's Private Limited clients are not leaked
      const pvtLtd = res.body.data.find(
        (item: any) => item.entityType === 'Private Limited'
      );
      expect(pvtLtd).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 68: Best Performer & Staff Leaderboard
  // ─────────────────────────────────────────────────────────────
  describe('Phase 68: Best Performer & Staff Leaderboard', () => {
    it('should calculate completion percentages and rank staff correctly', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/staff-performance')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);

      const staffAEntry = res.body.data.find(
        (item: any) => item.userId === staffAId.toString()
      );
      expect(staffAEntry).toBeDefined();
      expect(staffAEntry.totalAssigned).toBe(5);
      expect(staffAEntry.completed).toBe(4);
      expect(staffAEntry.completionPercentage).toBe(80);
      expect(staffAEntry.rank).toBe(1);

      const staffBEntry = res.body.data.find(
        (item: any) => item.userId === staffBId.toString()
      );
      expect(staffBEntry).toBeDefined();
      expect(staffBEntry.totalAssigned).toBe(5);
      expect(staffBEntry.completed).toBe(2);
      expect(staffBEntry.completionPercentage).toBe(40);
      expect(staffBEntry.rank).toBe(2);

      const staffCEntry = res.body.data.find(
        (item: any) => item.userId === staffCId.toString()
      );
      expect(staffCEntry).toBeDefined();
      expect(staffCEntry.totalAssigned).toBe(0);
      expect(staffCEntry.completed).toBe(0);
      expect(staffCEntry.completionPercentage).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 69: Attendance KPI Overview Aggregation
  // ─────────────────────────────────────────────────────────────
  describe('Phase 69: Attendance KPI Overview Aggregation', () => {
    it('should calculate exact daily attendance metrics and presence rate', async () => {
      const res = await request(app)
        .get(`/api/v1/analytics/attendance-overview?date=${testDate}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const kpis = res.body.data;

      expect(kpis.date).toBe(testDate);
      expect(kpis.totalStaff).toBe(10);
      expect(kpis.presentToday).toBe(6);
      expect(kpis.halfDayToday).toBe(1);
      expect(kpis.onLeaveToday).toBe(1);
      expect(kpis.absentToday).toBe(1);
      expect(kpis.unmarkedToday).toBe(1);
      // Presence rate: (6 + 0.5) / 10 = 65%
      expect(kpis.presenceRate).toBe(65);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 70: Unified Phase 2 Home Analytics Endpoint
  // ─────────────────────────────────────────────────────────────
  describe('Phase 70: Unified Phase 2 Home Analytics Endpoint', () => {
    it('should return all Phase 1 and Phase 2 aggregated analytics in a single unified payload', async () => {
      const startTime = Date.now();
      const res = await request(app)
        .get('/api/v1/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`);
      const duration = Date.now() - startTime;

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;

      // 1. Invoicing & Receivables & Unbilled
      expect(data.quickStats).toBeDefined();
      expect(data.quickStats.totalClients).toBeGreaterThanOrEqual(15);
      expect(data.quickStats.totalReceivables).toBeDefined();
      expect(data.quickStats.totalUnbilled).toBeGreaterThanOrEqual(0);

      // 2. Client Entity Breakdown
      expect(data.clientDistribution).toBeInstanceOf(Array);
      expect(data.clientDistribution.length).toBeGreaterThanOrEqual(2);

      // 3. Staff Performance Leaderboard
      expect(data.staffLeaderboard).toBeInstanceOf(Array);
      expect(data.staffLeaderboard.length).toBeGreaterThanOrEqual(2);
      expect(data.staffLeaderboard[0].rank).toBe(1);

      // 4. Attendance Status Summary
      expect(data.attendanceOverview).toBeDefined();
      expect(data.attendanceOverview.totalStaff).toBe(10);

      // 5. Upcoming Holidays
      expect(data.upcomingHolidays).toBeInstanceOf(Array);
      expect(data.upcomingHolidays.length).toBeGreaterThanOrEqual(2);

      // 6. Recent Activity
      expect(data.recentActivity).toBeDefined();
      expect(data.recentActivity.invoices).toBeDefined();

      // High performance benchmark
      expect(duration).toBeLessThan(1500);
    });
  });
});
