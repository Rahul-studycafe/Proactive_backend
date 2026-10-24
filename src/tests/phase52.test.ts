import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Attendance } from '../models/Attendance';
import dotenv from 'dotenv';

dotenv.config();

describe('Part 11: Phase 52 — Attendance Schema & Fast Indexing', () => {
  let orgAId: mongoose.Types.ObjectId;
  let orgBId: mongoose.Types.ObjectId;
  let user1Id: mongoose.Types.ObjectId;
  let user2Id: mongoose.Types.ObjectId;

  const orgASlug = 'att-orga-p52';
  const orgBSlug = 'att-orgb-p52';
  const user1Email = 'staff1.p52@example.com';
  const user2Email = 'staff2.p52@example.com';

  beforeAll(async () => {
    await connectDB();

    // Ensure indexes are built
    await Attendance.init();

    // Cleanup previous test state
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [user1Email, user2Email] } }).setOptions({ skipTenantPlugin: true });

    // Setup Org A
    const orgA = await Organization.create({ name: 'Attendance Org A P52', slug: orgASlug });
    orgAId = orgA._id as mongoose.Types.ObjectId;

    const roleA = await Role.create({
      tenantId: orgAId,
      name: 'Staff',
      isSuperAdmin: false,
      permissions: {}
    });

    const user1 = await User.create({
      tenantId: orgAId,
      name: 'Staff Member 1',
      username: 'staff1_p52',
      email: user1Email,
      password: 'password123',
      roleId: roleA._id
    });
    user1Id = user1._id as mongoose.Types.ObjectId;

    const user2 = await User.create({
      tenantId: orgAId,
      name: 'Staff Member 2',
      username: 'staff2_p52',
      email: user2Email,
      password: 'password123',
      roleId: roleA._id
    });
    user2Id = user2._id as mongoose.Types.ObjectId;

    // Setup Org B
    const orgB = await Organization.create({ name: 'Attendance Org B P52', slug: orgBSlug });
    orgBId = orgB._id as mongoose.Types.ObjectId;
  });

  afterAll(async () => {
    await Attendance.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteMany({ slug: { $in: [orgASlug, orgBSlug] } });
    await User.deleteMany({ email: { $in: [user1Email, user2Email] } }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: { $in: [orgAId, orgBId] } }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('1. should create a valid attendance document with all fields', async () => {
    const checkIn = new Date('2026-10-22T09:00:00Z');
    const checkOut = new Date('2026-10-22T17:30:00Z');

    const att = await Attendance.create({
      tenantId: orgAId,
      userId: user1Id,
      date: '2026-10-22',
      status: 'Present',
      checkIn,
      checkOut,
      totalMinutes: 510,
      overtimeMinutes: 0,
      markedBy: user1Id,
      notes: 'On-time arrival'
    });

    expect(att).toBeDefined();
    expect(att.tenantId.toString()).toBe(orgAId.toString());
    expect(att.userId.toString()).toBe(user1Id.toString());
    expect(att.date).toBe('2026-10-22');
    expect(att.status).toBe('Present');
    expect(att.totalMinutes).toBe(510);
    expect(att.overtimeMinutes).toBe(0);
    expect(att.notes).toBe('On-time arrival');
  });

  it('2. should enforce unique compound constraint on (tenantId, userId, date)', async () => {
    // Attempt duplicate insertion for same tenant, user, and date
    let duplicateError: any;
    try {
      await Attendance.create({
        tenantId: orgAId,
        userId: user1Id,
        date: '2026-10-22',
        status: 'Half Day',
        markedBy: user1Id
      });
    } catch (err: any) {
      duplicateError = err;
    }

    expect(duplicateError).toBeDefined();
    expect(duplicateError.code).toBe(11000); // E11000 duplicate key error
  });

  it('3. should allow another employee (user2) to have attendance on the same date for Org A', async () => {
    const attUser2 = await Attendance.create({
      tenantId: orgAId,
      userId: user2Id,
      date: '2026-10-22',
      status: 'Present',
      markedBy: user1Id
    });

    expect(attUser2).toBeDefined();
    expect(attUser2.userId.toString()).toBe(user2Id.toString());
  });

  it('4. should allow the same date and userId under a different tenantId', async () => {
    const attOrgB = await Attendance.create({
      tenantId: orgBId,
      userId: user1Id,
      date: '2026-10-22',
      status: 'Holiday',
      markedBy: user1Id
    });

    expect(attOrgB).toBeDefined();
    expect(attOrgB.tenantId.toString()).toBe(orgBId.toString());
  });

  it('5. should reject invalid date format (not YYYY-MM-DD)', async () => {
    let validationError: any;
    try {
      await Attendance.create({
        tenantId: orgAId,
        userId: user1Id,
        date: '22-10-2026',
        status: 'Present',
        markedBy: user1Id
      });
    } catch (err: any) {
      validationError = err;
    }

    expect(validationError).toBeDefined();
    expect(validationError.errors.date).toBeDefined();
  });

  it('6. should reject invalid status enum', async () => {
    let validationError: any;
    try {
      await Attendance.create({
        tenantId: orgAId,
        userId: user1Id,
        date: '2026-10-23',
        status: 'Vacationing' as any,
        markedBy: user1Id
      });
    } catch (err: any) {
      validationError = err;
    }

    expect(validationError).toBeDefined();
    expect(validationError.errors.status).toBeDefined();
  });

  it('7. should verify index configuration exists on collection', async () => {
    const indexes = await Attendance.collection.indexes();
    const indexNames = indexes.map((idx) => Object.keys(idx.key).join('_'));

    // Check unique compound index { tenantId: 1, userId: 1, date: 1 }
    const hasUniqueCompound = indexes.some(
      (idx) =>
        idx.key.tenantId === 1 &&
        idx.key.userId === 1 &&
        idx.key.date === 1 &&
        idx.unique === true
    );
    expect(hasUniqueCompound).toBe(true);

    // Check daily summary compound index { tenantId: 1, date: 1, status: 1 }
    const hasDailySummaryIndex = indexes.some(
      (idx) =>
        idx.key.tenantId === 1 &&
        idx.key.date === 1 &&
        idx.key.status === 1
    );
    expect(hasDailySummaryIndex).toBe(true);
  });
});
