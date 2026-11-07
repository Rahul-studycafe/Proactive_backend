import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../common/errors/api-error';
import { PermissionResolverService } from '../services/permission-resolver.service';
import { User } from '../modules/auth/schemas';

/**
 * Middleware ensuring user has permission to view firm-wide attendance desk or manage attendance.
 */
export const requireAttendanceViewAll = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || !req.tenantId) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
    }

    const state = await PermissionResolverService.resolveUserPermissions(
      req.user._id.toString(),
      req.tenantId.toString()
    );

    if (state.isSuperAdmin) {
      return next();
    }

    if (
      state.permissions['attendance:view_all']?.allowed ||
      state.permissions['attendance:manage']?.allowed
    ) {
      return next();
    }

    throw new ApiError(
      403,
      "Access Denied: Missing 'attendance:view_all' permission to view firm attendance desk",
      'FORBIDDEN'
    );
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware ensuring user has permission to view monthly attendance matrix.
 */
export const requireAttendanceMatrixView = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || !req.tenantId) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
    }

    const state = await PermissionResolverService.resolveUserPermissions(
      req.user._id.toString(),
      req.tenantId.toString()
    );

    if (state.isSuperAdmin) {
      return next();
    }

    if (
      state.permissions['attendance:matrix_view']?.allowed ||
      state.permissions['attendance:matrix_view_self']?.allowed ||
      state.permissions['attendance:view_all']?.allowed ||
      state.permissions['attendance:manage']?.allowed
    ) {
      return next();
    }

    throw new ApiError(
      403,
      "Access Denied: Missing 'attendance:matrix_view' or 'attendance:matrix_view_self' permission to view monthly matrix",
      'FORBIDDEN'
    );
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware ensuring user has permission to export payroll / attendance CSV.
 */
export const requireAttendanceExport = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || !req.tenantId) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
    }

    const state = await PermissionResolverService.resolveUserPermissions(
      req.user._id.toString(),
      req.tenantId.toString()
    );

    if (state.isSuperAdmin) {
      return next();
    }

    if (
      state.permissions['attendance:export_payroll']?.allowed ||
      state.permissions['attendance:manage']?.allowed
    ) {
      return next();
    }

    throw new ApiError(
      403,
      "Access Denied: Missing 'attendance:export_payroll' permission",
      'FORBIDDEN'
    );
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware ensuring user can add manual attendance entries or adjust records.
 */
export const requireAttendanceManualEntry = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || !req.tenantId) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
    }

    const state = await PermissionResolverService.resolveUserPermissions(
      req.user._id.toString(),
      req.tenantId.toString()
    );

    if (state.isSuperAdmin) {
      return next();
    }

    if (
      state.permissions['attendance:manual_entry']?.allowed ||
      state.permissions['attendance:manage']?.allowed
    ) {
      return next();
    }

    throw new ApiError(
      403,
      "Access Denied: Missing 'attendance:manual_entry' permission to record or adjust attendance",
      'FORBIDDEN'
    );
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware ensuring user can perform management/bulk actions.
 */
export const requireAttendanceManage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || !req.tenantId) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
    }

    const state = await PermissionResolverService.resolveUserPermissions(
      req.user._id.toString(),
      req.tenantId.toString()
    );

    if (state.isSuperAdmin) {
      return next();
    }

    if (state.permissions['attendance:manage']?.allowed) {
      return next();
    }

    throw new ApiError(
      403,
      "Access Denied: Missing 'attendance:manage' permission",
      'FORBIDDEN'
    );
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware allowing users to view their own attendance summary,
 * or allowing managers with attendance:view_all / attendance:manage to view any staff member's summary.
 */
export const requireAttendanceSelfOrManage = (paramOrBodyKey: 'params' | 'body') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.tenantId) {
        throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
      }

      const targetUserId =
        paramOrBodyKey === 'params' ? req.params.userId : req.body?.userId;

      // Self-access is always permitted if user has attendance:view_self
      if (targetUserId && targetUserId.toString() === req.user._id.toString()) {
        return next();
      }

      const state = await PermissionResolverService.resolveUserPermissions(
        req.user._id.toString(),
        req.tenantId.toString()
      );

      if (state.isSuperAdmin) {
        return next();
      }

      // If targeting another user, requires view_all, matrix_view, or manage
      if (
        state.permissions['attendance:view_all']?.allowed ||
        state.permissions['attendance:matrix_view']?.allowed ||
        state.permissions['attendance:manage']?.allowed
      ) {
        return next();
      }

      throw new ApiError(
        403,
        'You do not have permission to view other staff members attendance records',
        'FORBIDDEN'
      );
    } catch (err) {
      next(err);
    }
  };
};
