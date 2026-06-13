import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../models/Organization';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { sendSuccess } from '../utils/ApiResponse';
import { errorHandler } from '../middlewares/errorHandler';
import { generateAccessToken } from '../services/auth.service';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

app.get(
  '/api/v1/test-sbac',
  authenticate,
  authorize('task', 'view'),
  (req: Request, res: Response) => {
    return sendSuccess(res, 200, 'SBAC Access Granted', {
      permissionScope: req.permissionScope,
      scopeFilter: req.scopeFilter
    });
  }
);
app.use(errorHandler);

describe('Phase 14: SBAC Middleware Scoping', () => {
  let orgId: mongoose.Types.ObjectId;
  let limitedUserToken: string;
  let limitedUserId: mongoose.Types.ObjectId;

  const orgSlug = 'phase14-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'limited_sbac' }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'SBAC Org', slug: orgSlug, plan: { maxUsers: 5 } });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const limitedRole = new Role({
      tenantId: orgId,
      name: 'Limited Role',
      isSuperAdmin: false,
      permissions: {
        task: { view: { allowed: true, scope: 'assigned_only' } }
      }
    });
    const savedLimitedRole = await limitedRole.save();

    const limitedUser = new User({
      tenantId: orgId,
      name: 'Limited User',
      username: 'limited_sbac',
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
    await User.deleteMany({ username: 'limited_sbac' }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should inject assigned_only scopeFilter for Limited User', async () => {
    const res = await request(app)
      .get('/api/v1/test-sbac')
      .set('Authorization', `Bearer ${limitedUserToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.permissionScope).toBe('assigned_only');
    expect(res.body.data.scopeFilter.assignedUserId).toBe(limitedUserId.toString());
  });
});
