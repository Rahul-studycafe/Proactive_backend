import mongoose from 'mongoose';
import { Role, IRole } from '../modules/roles/schemas';
import { getDefaultRoleBlueprints } from '../config/permissions-catalogue';

export class RoleSeederService {
  /**
   * Seeds the 4 standard roles (Super Admin, Admin, Accountant, Staff) for a tenant if they do not exist.
   * Admin, Accountant, and Staff can be customized by the tenant Super Admin.
   */
  static async seedDefaultRolesForTenant(tenantId: mongoose.Types.ObjectId | string): Promise<{
    superAdminRole: IRole;
    adminRole: IRole;
    accountantRole: IRole;
    staffRole: IRole;
  }> {
    const blueprints = getDefaultRoleBlueprints();
    const createdRoles: Record<string, IRole> = {};

    for (const bp of blueprints) {
      let role = await Role.findOne({
        tenantId,
        name: bp.name
      }).setOptions({ skipTenantPlugin: true });

      if (!role) {
        role = await Role.create({
          tenantId,
          name: bp.name,
          description: bp.description,
          isSuperAdmin: bp.isSuperAdmin,
          isSystemDefault: bp.isSystemDefault,
          permissions: bp.permissions
        });
      } else {
        // Ensure isSuperAdmin flag is preserved on Super Admin
        let needsSave = false;
        if (bp.isSuperAdmin && !role.isSuperAdmin) {
          role.isSuperAdmin = true;
          needsSave = true;
        }

        // Ensure newly added catalog permissions are present in existing roles
        const currentPerms = role.permissions || {};
        for (const [permKey, defVal] of Object.entries(bp.permissions)) {
          if (currentPerms[permKey] === undefined) {
            currentPerms[permKey] = defVal;
            needsSave = true;
          }
        }

        if (needsSave) {
          role.permissions = currentPerms;
          role.markModified('permissions');
          await role.save();
        }
      }

      createdRoles[bp.name] = role;
    }

    return {
      superAdminRole: createdRoles['Super Admin'],
      adminRole: createdRoles['Admin'],
      accountantRole: createdRoles['Accountant'],
      staffRole: createdRoles['Staff']
    };
  }
}

