import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { Role, IRole } from '../models/Role';

/**
 * Middleware factory for Role-Based and Scope-Based Access Control.
 * 
 * @param moduleName The top-level module in the permissions matrix (e.g. 'client', 'task')
 * @param actionName The specific action (e.g. 'create', 'view')
 */
export const authorize = (moduleName: keyof IRole['permissions'], actionName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
      }

      // Fetch the role. We use skipTenantPlugin because req.tenantId is already attached,
      // but it's cleaner since we explicitly query by roleId.
      const role = await Role.findById(req.user.roleId).setOptions({ skipTenantPlugin: true });
      
      if (!role) {
        throw new ApiError(403, 'Role not found', 'FORBIDDEN');
      }

      // Super Admins bypass all matrix checks
      if (role.isSuperAdmin) {
        req.permissionScope = 'everything';
        req.scopeFilter = {};
        return next();
      }

      // 1. RBAC Matrix Check
      const modulePerms = role.permissions[moduleName as keyof typeof role.permissions];
      if (!modulePerms) {
         throw new ApiError(403, `Unknown permission module: ${moduleName}`, 'FORBIDDEN');
      }

      const actionPerm = (modulePerms as any)[actionName];
      if (!actionPerm || actionPerm.allowed !== true) {
         throw new ApiError(403, 'You do not have permission to perform this action', 'FORBIDDEN');
      }

      // 2. SBAC (Scope-Based) Injection
      const scope = actionPerm.scope;
      req.permissionScope = scope;

      if (scope === 'assigned_only') {
         req.scopeFilter = { assignedUserId: req.user._id };
      } else if (scope === 'team_only') {
         // Note: Assuming a 'teamMembers' array field will exist on models requiring team isolation.
         // This filter can be customized later when the Team schema is fully finalized.
         req.scopeFilter = { teamMembers: req.user._id };
      } else {
         // 'everything'
         req.scopeFilter = {};
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
