import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { User } from '../modules/auth/schemas';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { sendSuccess } from '../utils/ApiResponse';
import { errorHandler } from '../middlewares/error-handler';
import { generateAccessToken } from '../modules/auth/services/auth.service';
import authRoutes from '../routes/auth.routes';
import dotenv from 'dotenv';

dotenv.config();

// Create a local Express app for testing the middleware logic cleanly
const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

// Dummy protected routes to test authorization
app.get(
  '/api/v1/test-rbac',
  authenticate,
  authorize('client', 'create'),
  (req: Request, res: Response) => {
    return sendSuccess(res, 200, 'RBAC Access Granted');
  }
);



app.use(errorHandler);

describe('Phase 13: RBAC Middleware Checks', () => {
  let orgId: mongoose.Types.ObjectId;
  let superAdminToken: string;
  let limitedUserToken: string;
  let limitedUserId: mongoose.Types.ObjectId;

  const orgSlug = 'rbac-test-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: { $in: ['super_rbac', 'limited_rbac'] } }).setOptions({ skipTenantPlugin: true });

    // Create Org
    const org = new Organization({ name: 'RBAC Org', slug: orgSlug, plan: { maxUsers: 5 } });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    // Create Super Admin Role
    const superRole = new Role({
      tenantId: orgId,
      name: 'Super Admin',
      isSuperAdmin: true,
      permissions: {}
    });
    const savedSuperRole = await superRole.save();

    // Create Super Admin User
    const superUser = new User({
      tenantId: orgId,
      name: 'Super User',
      username: 'super_rbac',
      password: 'password123',
      roleId: savedSuperRole._id,
      tokenVersion: 1
    });
    await superUser.save();
    superAdminToken = generateAccessToken({
      userId: superUser._id.toString(),
      tenantId: orgId.toString(),
      roleId: savedSuperRole._id.toString(),
      tokenVersion: 1
    });

    // Create Limited Role (Can NOT create client, but CAN view tasks assigned_only)
    const limitedRole = new Role({
      tenantId: orgId,
      name: 'Limited Role',
      isSuperAdmin: false,
      permissions: {
        client: {
          create: { allowed: false, scope: 'everything' }
        },
        task: {
          view: { allowed: true, scope: 'assigned_only' }
        }
      }
    });
    const savedLimitedRole = await limitedRole.save();

    // Create Limited User
    const limitedUser = new User({
      tenantId: orgId,
      name: 'Limited User',
      username: 'limited_rbac',
      password: 'password123',
      roleId: savedLimitedRole._id,
      tokenVersion: 1
    });
    await limitedUser.save();
    limitedUserId = limitedUser._id as mongoose.Types.ObjectId;
    limitedUserToken = generateAccessToken({
      userId: limitedUser._id.toString(),
      tenantId: orgId.toString(),
      roleId: savedLimitedRole._id.toString(),
      tokenVersion: 1
    });
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: { $in: ['super_rbac', 'limited_rbac'] } }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  describe('Phase 13: RBAC Middleware Checks', () => {
    it('should bypass all checks for Super Admin', async () => {
      const res = await request(app)
        .get('/api/v1/test-rbac')
        .set('Authorization', `Bearer ${superAdminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('RBAC Access Granted');
    });

    it('should block Limited User from performing unauthorized action', async () => {
      const res = await request(app)
        .get('/api/v1/test-rbac')
        .set('Authorization', `Bearer ${limitedUserToken}`);
      
      // limitedRole has client.create.allowed = false
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

});
