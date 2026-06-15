import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../modules/auth/schemas';
import { Role } from '../modules/roles/schemas';
import { User } from '../modules/auth/schemas';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 15: User Profile API (/auth/me)', () => {
  let orgId: mongoose.Types.ObjectId;
  let userToken: string;
  const testPassword = 'securePassword123';
  const orgSlug = 'phase15-org';
  const username = 'phase15_tester';

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username }).setOptions({ skipTenantPlugin: true });

    const org = new Organization({ name: 'Phase 15 Org', slug: orgSlug, plan: { maxUsers: 5 } });
    const savedOrg = await org.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const role = new Role({
      tenantId: orgId,
      name: 'Profile Role',
      isSuperAdmin: false,
      permissions: {
        task: { view: { allowed: true, scope: 'team_only' } }
      }
    });
    const savedRole = await role.save();

    const user = new User({ tenantId: orgId, name: 'Phase 15 Tester', username, password: testPassword, roleId: savedRole._id, tokenVersion: 1 });
    await user.save();

    const loginRes = await request(app).post('/api/v1/auth/login').send({ orgSlug, username, password: testPassword });
    userToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: orgSlug });
    await User.deleteMany({ username }).setOptions({ skipTenantPlugin: true });
    await Role.deleteMany({ tenantId: orgId }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should return user profile with populated role matrix', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${userToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    
    const user = res.body.data.user;
    expect(user.name).toBe('Phase 15 Tester');
    expect(user.roleId).toHaveProperty('name', 'Profile Role');
    expect(user.roleId).toHaveProperty('permissions');
    expect(user.roleId.permissions.task.view.scope).toBe('team_only');
  });
});
