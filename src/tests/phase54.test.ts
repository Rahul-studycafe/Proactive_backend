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

describe('Part 11: Phase 54 — Daily Attendance Desk (Left-Join Roster) API', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let userAId: mongoose.Types.ObjectId;
  let userBId: mongoose.Types.ObjectId;
  let userCId: mongoose.Types.ObjectId;
  let inactiveUserId: mongoose.Types.ObjectId;
  let tokenA: string;
  let tokenB: string;

  const orgASlug = 'roster-orga-p54';
  const orgBSlug = 'roster-orgb-p54';
  const userAEmail = 'usera.p54@example.com';
  const userBEmail = 'userb.p54@example.com';
  const userCEmail = 'userc.p54@example.com';
  const userInactiveEmail = 'inactive.p54@example.com';
  const userOrgBEmail = 'orgb.p54@example.com';

  const testDate = '2026-10-22';

  beforeAll(async () => {
    await connectDB();
    await Attendance.init();

    // Cleanup previous test state
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [userAEmail, userBEmail, userCEmail, userInactiveEmail, userOrgBEmail] }
    }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({ name: 'Roster Org A P54', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Associate Staff',
      isSuperAdmin: false,
      permissions: {
        attendance: {
          manage: { allowed: true, scope: 'everything' }
        }
      }
    });

    // Create 3 active users in Org A
    const userA = await User.create({
      tenantId: orgAId,
      name: 'Alice Staff (Checked In)',
      username: 'alice_p54',
      email: userAEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    userAId = userA._id as mongoose.Types.ObjectId;

    const userB = await User.create({
      tenantId: orgAId,
      name: 'Bob Staff (On Leave)',
      username: 'bob_p54',
      email: userBEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    userBId = userB._id as mongoose.Types.ObjectId;

    const userC = await User.create({
      tenantId: orgAId,
      name: 'Charlie Staff (Unlogged)',
      username: 'charlie_p54',
      email: userCEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: true
    });
    userCId = userC._id as mongoose.Types.ObjectId;

    // Inactive user in Org A (must NOT appear in active roster)
    const inactiveUser = await User.create({
      tenantId: orgAId,
      name: 'Dave Inactive Staff',
      username: 'dave_inactive_p54',
      email: userInactiveEmail,
      password: 'password123',
      roleId: roleA._id,
      isActive: false
    });
    inactiveUserId = inactiveUser._id as mongoose.Types.ObjectId;

    // Login token for Org A
    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userAEmail, password: 'password123' });
    tokenA = loginA.body.data.accessToken;

    // Setup Org B (for multi-tenant data leak verification)
    const orgB = await Organization.create({ name: 'Roster Org B P54', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;

    const roleB = await Role.create({
      tenantId: orgBId,
      name: 'Manager',
      isSuperAdmin: true,
      permissions: {}
    });

    await User.create({
      tenantId: orgBId,
      name: 'Eve Org B',
      username: 'eve_orgb_p54',
      email: userOrgBEmail,
      password: 'password123',
      roleId: roleB._id,
      isActive: true
    });

    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userOrgBEmail, password: 'password123' });
    tokenB = loginB.body.data.accessToken;

    // Seed Attendance on testDate:
    // 1. User A is Checked In (Present)
    await Attendance.create({
      tenantId: orgAId,
      userId: userAId,
      date: testDate,
      status: 'Present',
      checkIn: new Date(`${testDate}T09:00:00Z`),
      markedBy: userAId
    });

    // 2. User B is on Leave
    await Attendance.create({
      tenantId: orgAId,
      userId: userBId,
      date: testDate,
      status: 'Leave',
      markedBy: userAId,
      notes: 'Approved medical leave'
    });

    // 3. User C has NO record created (Unlogged)
  }, 30000);

  afterAll(async () => {
    await Attendance.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({
      email: { $in: [userAEmail, userBEmail, userCEmail, userInactiveEmail, userOrgBEmail] }
    }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('1. should return left-joined daily roster for all 3 active users in Org A', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/daily?date=${testDate}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.date).toBe(testDate);

    const roster = res.body.data.roster;
    expect(roster.length).toBe(3); // Alice, Bob, Charlie (Dave is inactive so excluded)

    const names = roster.map((r: any) => r.name);
    expect(names).toContain('Alice Staff (Checked In)');
    expect(names).toContain('Bob Staff (On Leave)');
    expect(names).toContain('Charlie Staff (Unlogged)');
    expect(names).not.toContain('Dave Inactive Staff');
    expect(names).not.toContain('Eve Org B');
  });

  it('2. should verify correct individual attendance statuses and unlogged member', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/daily?date=${testDate}`)
      .set('Authorization', `Bearer ${tokenA}`);

    const roster = res.body.data.roster;
    const alice = roster.find((r: any) => r._id.toString() === userAId.toString());
    const bob = roster.find((r: any) => r._id.toString() === userBId.toString());
    const charlie = roster.find((r: any) => r._id.toString() === userCId.toString());

    // Alice: Present with checkIn
    expect(alice.attendance).toBeDefined();
    expect(alice.attendance.status).toBe('Present');
    expect(alice.attendance.checkIn).toBeDefined();

    // Bob: Leave with notes
    expect(bob.attendance).toBeDefined();
    expect(bob.attendance.status).toBe('Leave');
    expect(bob.attendance.notes).toBe('Approved medical leave');

    // Charlie: Unlogged (attendance is null / -- | --)
    expect(charlie.attendance).toBeNull();
  });

  it('3. should calculate exact daily summary statistics', async () => {
    const res = await request(app)
      .get(`/api/v1/attendance/daily?date=${testDate}`)
      .set('Authorization', `Bearer ${tokenA}`);

    const summary = res.body.data.summary;
    expect(summary).toEqual({
      totalStaff: 3,
      present: 1,
      halfDay: 0,
      leave: 1,
      absent: 0,
      holiday: 0,
      unmarked: 1
    });
  });

  it('4. should enforce strict tenant isolation (Org B sees only its staff)', async () => {
    const resB = await request(app)
      .get(`/api/v1/attendance/daily?date=${testDate}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.data.roster.length).toBe(1);
    expect(resB.body.data.roster[0].name).toBe('Eve Org B');
    expect(resB.body.data.summary.totalStaff).toBe(1);
    expect(resB.body.data.summary.unmarked).toBe(1);
  });

  it('5. should reject invalid date format in query parameter', async () => {
    const res = await request(app)
      .get('/api/v1/attendance/daily?date=22-10-2026')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_DATE_FORMAT');
  });

  it('6. should reject unauthenticated request with 401', async () => {
    const res = await request(app).get(`/api/v1/attendance/daily?date=${testDate}`);
    expect(res.status).toBe(401);
  });
});
