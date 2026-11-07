import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { RoleSeederService } from '../services/role-seeder.service';
import { PermissionResolverService } from '../services/permission-resolver.service';
import { Role } from '../modules/roles/schemas';
import { User, Organization } from '../modules/auth/schemas';
import { PERMISSION_CATALOGUE } from '../config/permissions-catalogue';

describe('Dynamic RBAC & Multi-Role Authorization Engine', () => {
  const testTenantId = new mongoose.Types.ObjectId();
  let superAdminUser: any;
  let staffUser: any;
  let seededRoles: any;

  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://root:secret@localhost:27017/proactive?authSource=admin';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    // Clean up test tenant artifacts if any
    await Role.deleteMany({ tenantId: testTenantId });
    await User.deleteMany({ tenantId: testTenantId });
    await Organization.deleteMany({ _id: testTenantId });

    // Create test organization
    await Organization.create({
      _id: testTenantId,
      name: 'Test RBAC Firm LLP',
      email: 'rbac-firm@example.com',
      isActive: true
    });
  });

  afterAll(async () => {
    await Role.deleteMany({ tenantId: testTenantId });
    await User.deleteMany({ tenantId: testTenantId });
    await Organization.deleteMany({ _id: testTenantId });
    PermissionResolverService.clearAll();
    await mongoose.disconnect();
  });

  it('1. Should seed the 4 default roles (Super Admin, Admin, Accountant, Staff) for tenant', async () => {
    seededRoles = await RoleSeederService.seedDefaultRolesForTenant(testTenantId);

    expect(seededRoles.superAdminRole).toBeDefined();
    expect(seededRoles.superAdminRole.name).toBe('Super Admin');
    expect(seededRoles.superAdminRole.isSuperAdmin).toBe(true);
    expect(seededRoles.superAdminRole.isSystemDefault).toBe(true);

    expect(seededRoles.adminRole).toBeDefined();
    expect(seededRoles.adminRole.name).toBe('Admin');
    expect(seededRoles.adminRole.isSuperAdmin).toBe(false);
    expect(seededRoles.adminRole.isSystemDefault).toBe(true);

    expect(seededRoles.accountantRole).toBeDefined();
    expect(seededRoles.accountantRole.name).toBe('Accountant');
    expect(seededRoles.accountantRole.isSuperAdmin).toBe(false);

    expect(seededRoles.staffRole).toBeDefined();
    expect(seededRoles.staffRole.name).toBe('Staff');
    expect(seededRoles.staffRole.isSuperAdmin).toBe(false);

    const count = await Role.countDocuments({ tenantId: testTenantId });
    expect(count).toBe(4);
  });

  it('2. Should resolve unrestricted permissions for Organization Owner / Super Admin', async () => {
    superAdminUser = await User.create({
      tenantId: testTenantId,
      name: 'Owner Admin',
      username: `owner_${Date.now()}`,
      email: `owner_${Date.now()}@example.com`,
      roleId: seededRoles.superAdminRole._id,
      roleIds: [seededRoles.superAdminRole._id],
      isOwner: true,
      isActive: true
    });

    const state = await PermissionResolverService.resolveUserPermissions(
      superAdminUser._id.toString(),
      testTenantId.toString()
    );

    expect(state.isSuperAdmin).toBe(true);
  });

  it('3. Should resolve single-role permissions for Staff user', async () => {
    staffUser = await User.create({
      tenantId: testTenantId,
      name: 'Standard Staff',
      username: `staff_${Date.now()}`,
      email: `staff_${Date.now()}@example.com`,
      roleId: seededRoles.staffRole._id,
      roleIds: [seededRoles.staffRole._id],
      isOwner: false,
      isActive: true
    });

    const state = await PermissionResolverService.resolveUserPermissions(
      staffUser._id.toString(),
      testTenantId.toString()
    );

    expect(state.isSuperAdmin).toBe(false);
    expect(state.permissions['client:view']?.allowed).toBe(true);
    expect(state.permissions['task:view']?.allowed).toBe(true);
    expect(state.permissions['task:view']?.scope).toBe('assigned_only');
    expect(state.permissions['invoice:create']?.allowed).toBeFalsy();
  });

  it('4. Should compute Multi-Role Union & Scope Widening when assigned multiple roles', async () => {
    // Create a custom role: "Audit Associate" with report:export and task:view (scope: everything)
    const auditRole = await Role.create({
      tenantId: testTenantId,
      name: `Audit Lead ${Date.now()}`,
      description: 'Audit team lead with wide task viewing and report exports',
      isSuperAdmin: false,
      isSystemDefault: false,
      permissions: {
        'report:export': { allowed: true, scope: 'everything' },
        'task:view': { allowed: true, scope: 'everything' }
      }
    });

    // Assign BOTH Staff role and Audit Lead role to staffUser
    staffUser.roleIds = [seededRoles.staffRole._id, auditRole._id];
    await staffUser.save();

    // Invalidate cache
    PermissionResolverService.invalidateUser(staffUser._id.toString());

    const multiState = await PermissionResolverService.resolveUserPermissions(
      staffUser._id.toString(),
      testTenantId.toString()
    );

    // Multi-role union assertions:
    // 1. client:view from Staff role
    expect(multiState.permissions['client:view']?.allowed).toBe(true);
    // 2. report:export from Audit Lead role
    expect(multiState.permissions['report:export']?.allowed).toBe(true);
    // 3. Scope widening: task:view was 'assigned_only' in Staff, but 'everything' in Audit Lead -> result must be 'everything'
    expect(multiState.permissions['task:view']?.allowed).toBe(true);
    expect(multiState.permissions['task:view']?.scope).toBe('everything');
  });

  it('5. Should invalidate cache when tenant roles are updated', async () => {
    // Initial fetch to cache
    const initial = await PermissionResolverService.resolveUserPermissions(
      staffUser._id.toString(),
      testTenantId.toString()
    );
    expect(initial.roles.length).toBeGreaterThanOrEqual(1);

    // Invalidate entire tenant
    PermissionResolverService.invalidateTenant(testTenantId.toString());

    // Next call re-resolves from DB smoothly
    const reloaded = await PermissionResolverService.resolveUserPermissions(
      staffUser._id.toString(),
      testTenantId.toString()
    );
    expect(reloaded).toBeDefined();
    expect(reloaded.isSuperAdmin).toBe(false);
  });
});
