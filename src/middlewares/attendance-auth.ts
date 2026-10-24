import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../common/errors/api-error';
import { Role } from '../modules/roles/schemas';
import { User } from '../modules/auth/schemas';

/**
 * Middleware enforcing Attendance Permissions and Scope-Based Access Control (Phase 59):
 * - SuperAdmin: Allowed full access.
 * - Strict Deny-by-Default: Non-admin roles must have explicit attendance permissions.
 * - Role with `attendance.manage.allowed === true`:
 *   - Scope `everything`: Can mark for anyone, view monthly grid, and trigger bulk updates.
 *   - Scope `team_only`: If targeting another user, must share the same department or report to req.user._id.
 * - Role with `attendance.view_self.allowed === true`: Can only check in/out for themselves and view their own monthly history.
 */
export const requireAttendanceManage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
    }

    const role = await Role.findById(req.user.roleId).setOptions({
      skipTenantPlugin: true
    });
    if (!role) {
      throw new ApiError(403, 'Role not found', 'FORBIDDEN');
    }

    if (role.isSuperAdmin) {
      return next();
    }

    const attPerms = role.permissions?.attendance as any;
    if (!attPerms?.manage?.allowed) {
      throw new ApiError(
        403,
        'You do not have permission to perform management actions on attendance',
        'FORBIDDEN'
      );
    }

    next();
  } catch (err) {
    next(err);
  }
};

export const requireAttendanceSelfOrManage = (paramOrBodyKey: 'params' | 'body') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
      }

      const role = await Role.findById(req.user.roleId).setOptions({
        skipTenantPlugin: true
      });
      if (!role) {
        throw new ApiError(403, 'Role not found', 'FORBIDDEN');
      }

      if (role.isSuperAdmin) {
        return next();
      }

      const attPerms = role.permissions?.attendance as any;
      if (!attPerms) {
        throw new ApiError(
          403,
          'You do not have permission to access attendance records',
          'FORBIDDEN'
        );
      }

      const targetUserId =
        paramOrBodyKey === 'params'
          ? req.params.userId
          : req.body?.userId;

      if (attPerms.manage?.allowed === true) {
        if (
          attPerms.manage.scope === 'team_only' &&
          targetUserId &&
          targetUserId.toString() !== req.user._id.toString()
        ) {
          const target = await User.findById(targetUserId).select('departmentId managerId');
          const isSameDept =
            req.user.departmentId &&
            target?.departmentId &&
            req.user.departmentId.toString() === target.departmentId.toString();
          const isDirectReport =
            target?.managerId && target.managerId.toString() === req.user._id.toString();

          if (!isSameDept && !isDirectReport) {
            throw new ApiError(403, 'Cannot access attendance outside your team', 'FORBIDDEN');
          }
        }
        return next();
      }

      if (attPerms.view_self?.allowed === true) {
        if (targetUserId && targetUserId.toString() !== req.user._id.toString()) {
          throw new ApiError(
            403,
            'You do not have permission to view or modify other employees attendance records',
            'FORBIDDEN'
          );
        }
        return next();
      }

      throw new ApiError(
        403,
        'You do not have permission to access attendance records',
        'FORBIDDEN'
      );
    } catch (err) {
      next(err);
    }
  };
};
