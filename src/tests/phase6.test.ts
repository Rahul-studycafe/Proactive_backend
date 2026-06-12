import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import { Organization } from '../models/Organization';
import { Role } from '../models/Role';
import { User } from '../models/User';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 6: User and Role Models', () => {
  let orgId: mongoose.Types.ObjectId;
  let roleId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectDB();
    await Organization.deleteOne({ slug: 'phase6-org' });
    await Role.deleteMany({ name: 'Super Admin Test' }).setOptions({ skipTenantPlugin: true });
    await User.deleteMany({ username: 'admin_test' }).setOptions({ skipTenantPlugin: true });

    const newOrg = new Organization({
      name: 'Phase 6 Org',
      slug: 'phase6-org',
      plan: { maxUsers: 5 }
    });
    const savedOrg = await newOrg.save();
    orgId = savedOrg._id as mongoose.Types.ObjectId;

    const newRole = new Role({
      tenantId: orgId,
      name: 'Super Admin Test',
      isSuperAdmin: true,
      permissions: {}
    });
    const savedRole = await newRole.save();
    roleId = savedRole._id as mongoose.Types.ObjectId;
  });

  afterAll(async () => {
    await Organization.deleteOne({ slug: 'phase6-org' });
    await Role.deleteMany({ name: 'Super Admin Test' }).setOptions({ skipTenantPlugin: true });
    await User.deleteMany({ username: 'admin_test' }).setOptions({ skipTenantPlugin: true });
    await mongoose.connection.close();
  });

  it('should save user and securely hash password', async () => {
    const plainTextPassword = 'secretPassword123';
    const newUser = new User({
      tenantId: orgId,
      name: 'Admin User',
      username: 'admin_test',
      email: 'admin@test.com',
      password: plainTextPassword,
      roleId: roleId
    });
    
    const savedUser = await newUser.save();
    expect(savedUser._id).toBeDefined();

    // Verify password hash directly from DB
    const userFromDb = await User.findById(savedUser._id).select('+password').setOptions({ skipTenantPlugin: true });
    expect(userFromDb).not.toBeNull();
    
    // Check that it's hashed and not plain text
    expect(userFromDb!.password).not.toBe(plainTextPassword);
    
    // Verify comparePassword method
    const isMatch = await userFromDb!.comparePassword(plainTextPassword);
    expect(isMatch).toBe(true);
  });
});
