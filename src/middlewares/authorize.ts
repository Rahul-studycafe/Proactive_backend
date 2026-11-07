import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../common/errors/api-error';
import { PermissionResolverService } from '../services/permission-resolver.service';

/**
 * Middleware factory for Role-Based and Scope-Based Access Control.
 * Accepts canonical "resource:action" (e.g. 'client:create'),
 * an array of alternative permissions (e.g. ['client:services_manage', 'client:edit']),
 * or legacy (moduleName, actionName) (e.g. 'client', 'create').
 */
export const authorize = (
  permissionOrModule: string | string[],
  legacyAction?: string
) => {
  const permissions: string[] = Array.isArray(permissionOrModule)
    ? permissionOrModule
    : legacyAction
      ? [`${permissionOrModule}:${legacyAction}`]
      : [permissionOrModule];

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.tenantId) {
        throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
      }

      const effectiveState = await PermissionResolverService.resolveUserPermissions(
        req.user._id.toString(),
        req.tenantId.toString()
      );

      // Super Admins bypass all matrix checks
      if (effectiveState.isSuperAdmin) {
        req.permissionScope = 'everything';
        req.scopeFilter = {};
        return next();
      }

      // Check if ANY of the requested permissions is allowed
      const allowedPerm = permissions
        .map((p) => effectiveState.permissions[p])
        .find((p) => p && p.allowed);

      if (!allowedPerm) {
        throw new ApiError(
          403,
          `Access Denied: Missing '${permissions.join("' or '")}' permission`,
          'FORBIDDEN'
        );
      }

      // Inject data-level scope filters for controllers
      const scope = allowedPerm.scope || 'everything';
      req.permissionScope = scope;

      if (scope === 'assigned_only') {
        req.scopeFilter = {
          $or: [
            { assignedUsers: req.user._id },
            { assigneeIds: req.user._id },
            { assignedUserId: req.user._id },
            { createdBy: req.user._id }
          ]
        };
      } else if (scope === 'team_only') {
        req.scopeFilter = {
          $or: [
            { departmentId: req.user.departmentId },
            { teamMembers: req.user._id }
          ]
        };
      } else {
        req.scopeFilter = {};
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
