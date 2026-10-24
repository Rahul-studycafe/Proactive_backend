import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization, User } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { Service } from '../modules/services/schemas/service.schema';
import { Package } from '../modules/services/schemas/package.schema';
import { Client } from '../modules/clients/schemas/client.schema';
import { Task } from '../models/Task';
import { AutomationLog } from '../models/AutomationLog';
import {
  calculatePeriodString,
  calculateDueDate,
  shouldSpawnToday
} from '../services/recurrence.service';
import {
  generateTaskForClientService,
  scanAndGenerateRecurringTasks
} from '../services/task-generation.service';
import {
  getTaskAutomationQueue,
  startAutomationWorker,
  closeAutomationQueue,
  TASK_AUTOMATION_QUEUE_NAME
} from '../queues/task-automation.queue';
import { QueueEvents } from 'bullmq';
import { getRedisConnection } from '../config/redis';
import { generateAccessToken } from '../modules/auth/services/auth.service';
import dotenv from 'dotenv';

dotenv.config();

jest.setTimeout(40000);

describe('Part 13: BullMQ Automation Engine & Recurring Tasks (Phases 61–66)', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminId: mongoose.Types.ObjectId;
  let staffId: mongoose.Types.ObjectId;
  let adminToken: string;

  let service1Id: mongoose.Types.ObjectId;
  let service2Id: mongoose.Types.ObjectId;
  let packageId: mongoose.Types.ObjectId;
  let client1Id: mongoose.Types.ObjectId;
  let client2Id: mongoose.Types.ObjectId;

  const orgSlug = 'bullmq-automation-p61-66';
  const adminEmail = 'admin.p61@example.com';
  const staffEmail = 'staff.p61@example.com';

  beforeAll(async () => {
    await connectDB();
    await Task.init();
    await AutomationLog.init();

    // Clean up
    await Organization.deleteMany({ slug: orgSlug });
    await User.deleteMany({ email: { $in: [adminEmail, staffEmail] } }).setOptions({
      skipTenantPlugin: true
    });

    // 1. Setup Tenant
    const org = await Organization.create({ name: 'Automation Org P61-66', slug: orgSlug });
    orgId = org._id as mongoose.Types.ObjectId;

    // 2. Setup Roles & Users
    const adminRole = await Role.create({
      tenantId: orgId,
      name: 'Admin Role P61',
      isSuperAdmin: true,
      permissions: {}
    });

    const staffRole = await Role.create({
      tenantId: orgId,
      name: 'Staff Role P61',
      isSuperAdmin: false,
      permissions: {}
    });

    const adminUser = await User.create({
      tenantId: orgId,
      name: 'Admin Boss',
      username: 'admin_p61',
      email: adminEmail,
      password: 'password123',
      roleId: adminRole._id,
      isActive: true
    });
    adminId = adminUser._id as mongoose.Types.ObjectId;

    const staffUser = await User.create({
      tenantId: orgId,
      name: 'Associate Staff',
      username: 'staff_p61',
      email: staffEmail,
      password: 'password123',
      roleId: staffRole._id,
      isActive: true
    });
    staffId = staffUser._id as mongoose.Types.ObjectId;

    adminToken = generateAccessToken({
      userId: adminId.toString(),
      tenantId: orgId.toString(),
      roleId: adminRole._id.toString(),
      tokenVersion: adminUser.tokenVersion || 0
    });

    // 3. Setup Services
    const service1 = await Service.create({
      tenantId: orgId,
      name: 'GST-3B Monthly Filing',
      isEnabled: true,
      isRecurring: true,
      frequency: {
        type: 'monthly',
        creationDay: 1,
        dueDay: 20,
        creationMonthOffset: 'previous'
      },
      assignedUsers: [staffId],
      defaultBillingRate: 2500,
      isBillable: true,
      checklist: [
        { stepName: 'Collect Purchase Register', orderIndex: 1 },
        { stepName: 'Reconcile GSTR-2B', orderIndex: 2 },
        { stepName: 'File GST-3B on Portal', orderIndex: 3 }
      ],
      customFieldsDef: [
        { label: 'ARN Number', fieldType: 'text', isRequired: false }
      ]
    });
    service1Id = service1._id as mongoose.Types.ObjectId;

    const service2 = await Service.create({
      tenantId: orgId,
      name: 'TDS Quarterly Filing',
      isEnabled: true,
      isRecurring: true,
      frequency: {
        type: 'quarterly',
        creationDay: 1,
        dueDay: 30,
        creationMonthOffset: 'previous'
      },
      assignedUsers: [adminId],
      defaultBillingRate: 4000,
      isBillable: true,
      checklist: [
        { stepName: 'Collect Challans', orderIndex: 1 },
        { stepName: 'Validate FVU File', orderIndex: 2 }
      ]
    });
    service2Id = service2._id as mongoose.Types.ObjectId;

    // 4. Setup Package including Service 2
    const pkg = await Package.create({
      tenantId: orgId,
      name: 'Corporate Compliance Package',
      frequency: 'quarterly',
      defaultBillingAmount: 8000,
      serviceIds: [service2Id],
      isActive: true
    });
    packageId = pkg._id as mongoose.Types.ObjectId;

    // 5. Setup Clients
    // Client 1 subscribed directly to Service 1
    const client1 = await Client.create({
      tenantId: orgId,
      name: 'Acme Technologies Ltd',
      fileNo: 'ACME-001',
      entityType: 'Private Limited',
      assignedUsers: [adminId],
      subscribedServices: [
        {
          serviceId: service1Id,
          customPrice: 3000,
          customUsers: [staffId],
          subscribedAt: new Date()
        }
      ],
      isActive: true
    });
    client1Id = client1._id as mongoose.Types.ObjectId;

    // Client 2 subscribed to Package
    const client2 = await Client.create({
      tenantId: orgId,
      name: 'Beta Global LLP',
      fileNo: 'BETA-002',
      entityType: 'LLP',
      assignedUsers: [staffId],
      subscribedPackages: [
        {
          packageId,
          subscribedAt: new Date()
        }
      ],
      isActive: true
    });
    client2Id = client2._id as mongoose.Types.ObjectId;
  });

  afterAll(async () => {
    await closeAutomationQueue();
    await Task.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await AutomationLog.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Client.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Package.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Service.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await User.deleteMany({ email: { $in: [adminEmail, staffEmail] } }).setOptions({
      skipTenantPlugin: true
    });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteMany({ slug: orgSlug });
    await mongoose.connection.close();
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 62: Recurrence Rule & Period Calculation Engine Tests
  // ─────────────────────────────────────────────────────────────
  describe('Phase 62: Recurrence Rule & Period Calculation Engine', () => {
    it('should correctly calculate Monthly periods for previous and current offsets', () => {
      const febDate = new Date(Date.UTC(2026, 1, 15)); // 15 Feb 2026
      expect(calculatePeriodString('monthly', febDate, 'previous')).toBe('Jan 2026');
      expect(calculatePeriodString('monthly', febDate, 'current')).toBe('Feb 2026');

      // Edge case: January rolling back to December of previous year
      const janDate = new Date(Date.UTC(2026, 0, 5)); // 5 Jan 2026
      expect(calculatePeriodString('monthly', janDate, 'previous')).toBe('Dec 2025');
    });

    it('should correctly calculate Quarterly periods under Indian financial year', () => {
      // May 2026 is in Q1 (Apr-Jun 2026)
      const mayDate = new Date(Date.UTC(2026, 4, 10));
      expect(calculatePeriodString('quarterly', mayDate, 'current')).toBe('Q1 (Apr-Jun) 2026');
      expect(calculatePeriodString('quarterly', mayDate, 'previous')).toBe('Q4 (Jan-Mar) 2026');

      // August 2026 is in Q2 (Jul-Sep 2026)
      const augDate = new Date(Date.UTC(2026, 7, 10));
      expect(calculatePeriodString('quarterly', augDate, 'current')).toBe('Q2 (Jul-Sep) 2026');
      expect(calculatePeriodString('quarterly', augDate, 'previous')).toBe('Q1 (Apr-Jun) 2026');
    });

    it('should correctly calculate Yearly periods', () => {
      const novDate = new Date(Date.UTC(2026, 10, 1));
      expect(calculatePeriodString('yearly', novDate, 'current')).toBe('FY 2026-27');
      expect(calculatePeriodString('yearly', novDate, 'previous')).toBe('FY 2025-26');
    });

    it('should calculate due dates and clamp to month boundaries properly', () => {
      // February in non-leap year (e.g. 2025 has 28 days)
      const feb2025 = new Date(Date.UTC(2025, 1, 1));
      const dueFeb = calculateDueDate(31, feb2025);
      expect(dueFeb.getUTCDate()).toBe(28);

      // February in leap year (2024 has 29 days)
      const feb2024 = new Date(Date.UTC(2024, 1, 1));
      const dueFebLeap = calculateDueDate(31, feb2024);
      expect(dueFebLeap.getUTCDate()).toBe(29);

      // April has 30 days
      const apr2026 = new Date(Date.UTC(2026, 3, 1));
      const dueApr = calculateDueDate(31, apr2026);
      expect(dueApr.getUTCDate()).toBe(30);
    });

    it('should accurately detect shouldSpawnToday', () => {
      const today1st = new Date(Date.UTC(2026, 4, 1)); // 1st May 2026
      expect(shouldSpawnToday({ type: 'monthly', creationDay: 1 }, today1st)).toBe(true);
      expect(shouldSpawnToday({ type: 'monthly', creationDay: 15 }, today1st)).toBe(false);
      expect(shouldSpawnToday({ type: 'one_time', creationDay: 1 }, today1st)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 63: Idempotent Task Generation Engine Tests
  // ─────────────────────────────────────────────────────────────
  describe('Phase 63: Idempotent Task Generation Engine', () => {
    it('should create task on first call and skip with "Already Spawned" on duplicate call', async () => {
      const period = 'Jan 2026';

      // 1st Execution: Should create task
      const firstRun = await generateTaskForClientService(
        orgId,
        client1Id,
        service1Id,
        period,
        new Date(Date.UTC(2026, 1, 1))
      );

      expect(firstRun.status).toBe('Created');
      expect(firstRun.task).toBeDefined();
      expect(firstRun.task?.description).toContain('GST-3B Monthly Filing - Jan 2026');
      expect(firstRun.task?.checklist.length).toBe(3);
      expect(firstRun.task?.checklist[0].stepName).toBe('Collect Purchase Register');
      expect(firstRun.task?.creationType).toBe('automated');

      // 2nd Execution: Should skip and return existing task
      const secondRun = await generateTaskForClientService(
        orgId,
        client1Id,
        service1Id,
        period,
        new Date(Date.UTC(2026, 1, 1))
      );

      expect(secondRun.status).toBe('Skipped');
      expect(secondRun.reason).toBe('Already Spawned');
      expect(secondRun.task?._id.toString()).toBe(firstRun.task?._id.toString());

      // Confirm only 1 document in MongoDB
      const count = await Task.countDocuments({
        tenantId: orgId,
        clientId: client1Id,
        serviceId: service1Id,
        'period.label': period
      });
      expect(count).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 64 & Phase 61: Daily Worker & BullMQ Queue Execution
  // ─────────────────────────────────────────────────────────────
  describe('Phase 61 & 64: BullMQ Queue & Worker Execution', () => {
    it('should dispatch job to BullMQ queue and process automated task scan', async () => {
      const queue = getTaskAutomationQueue();
      const worker = startAutomationWorker();
      const queueEvents = new QueueEvents(TASK_AUTOMATION_QUEUE_NAME, {
        connection: getRedisConnection()
      });

      // Dispatch a test job with target reference date
      const job = await queue.add('test-daily-run', {
        tenantId: orgId.toString(),
        runType: 'Cron',
        forceAll: true, // Generate for all subscribed services
        referenceDate: '2026-03-01T00:00:00.000Z'
      });

      expect(job.id).toBeDefined();

      // Wait for job to complete
      const completedResult = await job.waitUntilFinished(queueEvents);
      await queueEvents.close();

      expect(completedResult).toBeDefined();
      expect(completedResult.scannedClients).toBeGreaterThanOrEqual(2);
      expect(completedResult.tasksCreated).toBeGreaterThanOrEqual(1);

      // Verify task spawned for Client 2 via subscribed package
      const client2Task = await Task.findOne({
        tenantId: orgId,
        clientId: client2Id,
        serviceId: service2Id
      });
      expect(client2Task).toBeDefined();
      expect(client2Task?.description).toContain('TDS Quarterly Filing');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 65: Manual & On-Demand Automation Trigger API
  // ─────────────────────────────────────────────────────────────
  describe('Phase 65: Manual & On-Demand Automation Trigger API', () => {
    it('should trigger on-demand task generation via POST /api/v1/automation/trigger-tasks', async () => {
      const res = await request(app)
        .post('/api/v1/automation/trigger-tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientId: client1Id.toString(),
          serviceId: service1Id.toString()
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.scannedClients).toBe(1);
      expect(res.body.data.details).toBeInstanceOf(Array);
      expect(res.body.data.details.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 66: Automation Audit Log & History API
  // ─────────────────────────────────────────────────────────────
  describe('Phase 66: Automation Audit Log & History API', () => {
    it('should fetch audit logs via GET /api/v1/automation/logs with pagination metadata', async () => {
      const res = await request(app)
        .get('/api/v1/automation/logs?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.logs).toBeInstanceOf(Array);
      expect(res.body.data.logs.length).toBeGreaterThan(0);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.total).toBeGreaterThan(0);

      const firstLog = res.body.data.logs[0];
      expect(firstLog.runType).toBeDefined();
      expect(['Cron', 'Manual']).toContain(firstLog.runType);
      expect(firstLog.startedAt).toBeDefined();
      expect(firstLog.completedAt).toBeDefined();
    });
  });
});
