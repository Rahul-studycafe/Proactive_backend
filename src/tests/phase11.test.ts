import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { User } from '../modules/auth/schemas';
import { authenticate } from '../middlewares/authenticate';
import { sendSuccess } from '../utils/ApiResponse';
import { generateAccessToken } from '../modules/auth/services/auth.service';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

app.get('/api/v1/test-tenant-scope', authenticate, (req: Request, res: Response) => {
  return sendSuccess(res, 200, 'Scope active', { tenantId: req.tenantId?.toString() });
});

describe('Phase 11: Tenant Scope Middleware', () => {
  let orgId: mongoose.Types.ObjectId;
  let token: string;
  const orgSlug = 'phase11-org';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'phase11_user' }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Phase 11 Org', slug: orgSlug, plan: { maxUsers: 5 } });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const role = new Role({ tenantId: orgId, name: 'Admin', isSuperAdmin: true, permissions: {} });
    const savedRole = await role.save();

    const user = new User({ tenantId: orgId, name: 'User', username: 'phase11_user', password: 'password', roleId: savedRole._id });
    await user.save();

    token = generateAccessToken({
      userId: user._id.toString(),
      tenantId: orgId.toString(),
      roleId: savedRole._id.toString(),
      tokenVersion: 0
    });
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username: 'phase11_user' }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should inject tenantId into the request object', async () => {
    const res = await request(app)
      .get('/api/v1/test-tenant-scope')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tenantId).toBe(orgId.toString());
  });
});
