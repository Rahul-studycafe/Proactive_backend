import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../models/Organization';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Client } from '../models/Client';
import { Service } from '../models/Service';
import { Task } from '../models/Task';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 34-39: Task Management APIs', () => {
  let orgId: mongoose.Types.ObjectId;
  let adminToken: string;
  let staffToken: string;
  let clientId: string;
  let serviceId: string;
  let taskId: string;
  let staffUserId: string;

  const orgSlug = 'taskorg-phase34';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: { $in: ['admin34', 'staff34'] } }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Task Org', slug: orgSlug });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    // Super Admin Role
    const superRole = new Role({ tenantId: orgId, name: 'Super Admin', isSuperAdmin: true, permissions: {} });
    await superRole.save();

    // Staff Role (Restricted Scope)
    const staffRole = new Role({
      tenantId: orgId,
      name: 'Staff',
      permissions: {
        task: {
          view: { allowed: true, scope: 'assigned_only' },
          create: { allowed: true, scope: 'everything' },
          edit: { allowed: true, scope: 'everything' },
          deleteNote: { allowed: true, scope: 'everything' }
        }
      }
    });
    await staffRole.save();

    // Admin User
    const adminUser = new User({ tenantId: orgId, name: 'Admin', username: 'admin34', password: 'password', roleId: superRole._id });
    await adminUser.save();

    // Staff User
    const staffUser = new User({ tenantId: orgId, name: 'Staff User', username: 'staff34', password: 'password', roleId: staffRole._id });
    const savedStaffUser = await staffUser.save();
    staffUserId = savedStaffUser._id.toString();

    // Login Admin
    let res = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'admin34', password: 'password' });
    adminToken = res.body.data.accessToken;

    // Login Staff
    res = await request(app).post('/api/v1/auth/login').send({ orgSlug, username: 'staff34', password: 'password' });
    staffToken = res.body.data.accessToken;

    // Create Client
    const client = new Client({ tenantId: orgId, name: 'Test Client', entityType: 'Individual' });
    const savedClient = await client.save();
    clientId = savedClient._id.toString();

    // Create Service with Checklist
    const service = new Service({
      tenantId: orgId,
      name: 'Tax Return',
      checklist: [
        { stepName: 'Collect Docs', orderIndex: 1 },
        { stepName: 'File Return', orderIndex: 2 }
      ]
    });
    const savedService = await service.save();
    serviceId = savedService._id.toString();
  });

  afterAll(async () => {
    await Task.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Client.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Service.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: { $in: ['admin34', 'staff34'] } }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  describe('Task Creation & Checklist Copying', () => {
    it('should create a task and copy checklist from service', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientId,
          serviceId,
          assignedUserId: staffUserId,
          title: 'Tax Return for Test Client 2026',
          dueDate: new Date().toISOString()
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checklist.length).toBe(2);
      expect(res.body.data.checklist[0].stepName).toBe('Collect Docs');
      expect(res.body.data.checklist[0].isCompleted).toBe(false);
      
      taskId = res.body.data._id;
    });
  });

  describe('Task Update & Completion Rules', () => {
    it('should not allow marking task as completed if checklist is incomplete', async () => {
      const res = await request(app)
        .put(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'Completed'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Checklist is incomplete');
    });

    it('should allow toggling checklist step', async () => {
      // Toggle first step
      let res = await request(app)
        .patch(`/api/v1/tasks/${taskId}/checklist/0`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ isCompleted: true });

      expect(res.status).toBe(200);
      expect(res.body.data.isCompleted).toBe(true);
      expect(res.body.data.completedBy).toBe(staffUserId);

      // Toggle second step
      res = await request(app)
        .patch(`/api/v1/tasks/${taskId}/checklist/1`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ isCompleted: true });

      expect(res.status).toBe(200);
    });

    it('should allow completing task after checklist is done', async () => {
      const res = await request(app)
        .put(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'Completed'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Completed');
      expect(res.body.data.completedAt).toBeDefined();
    });
  });

  describe('Task Notes', () => {
    let noteId: string;

    it('should add a note to a task', async () => {
      const res = await request(app)
        .post(`/api/v1/tasks/${taskId}/notes`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ content: 'Waiting for client documents' });

      expect(res.status).toBe(201);
      expect(res.body.data.content).toBe('Waiting for client documents');
      noteId = res.body.data._id;
    });

    it('should delete a note', async () => {
      const res = await request(app)
        .delete(`/api/v1/tasks/${taskId}/notes/${noteId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Scope Based Access Control (SBAC)', () => {
    it('staff should only see assigned tasks', async () => {
      // Create another task unassigned to staff
      await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientId,
          title: 'Unassigned Task'
        });

      const res = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      // Even though there are 2 tasks in the system, staff only sees 1 (assigned to them)
      expect(res.body.data.tasks.length).toBe(1);
      expect(res.body.data.tasks[0]._id).toBe(taskId);
    });

    it('admin should see all tasks', async () => {
      const res = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tasks.length).toBe(2);
    });
  });
});
