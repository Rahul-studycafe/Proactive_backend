import { Request, Response, NextFunction } from 'express';
import { TenantSubscription } from '../models/TenantSubscription';
import { User } from '../modules/auth/schemas';
import { Client } from '../modules/clients/schemas/client.schema';
import { ApiError } from '../common/errors/api-error';

/**
 * Phase 144: Enforces user/seat quotas based on tenant SaaS subscription.
 */
export const checkSeatLimit = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return next();

    const sub = await TenantSubscription.findOne({ tenantId });
    if (!sub) {
      // Default fallback if no subscription configured yet (standard limit)
      return next();
    }

    if (sub.status === 'Cancelled') {
      return next(new ApiError(403, 'Subscription has been cancelled. Please renew to add users.'));
    }

    const activeUsers = await User.countDocuments({ tenantId, isActive: true });
    if (activeUsers >= sub.maxUsers) {
      return next(
        new ApiError(
          403,
          `User limit reached for current subscription plan (${sub.maxUsers} max). Please upgrade to add more staff.`
        )
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Phase 144: Enforces client record quotas based on tenant SaaS subscription.
 */
export const checkClientLimit = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return next();

    const sub = await TenantSubscription.findOne({ tenantId });
    if (!sub) {
      return next();
    }

    if (sub.status === 'Cancelled') {
      return next(new ApiError(403, 'Subscription has been cancelled. Please renew to add clients.'));
    }

    const totalClients = await Client.countDocuments({ tenantId });
    if (totalClients >= sub.maxClients) {
      return next(
        new ApiError(
          403,
          `Client limit reached for current subscription plan (${sub.maxClients} max). Please upgrade to add more clients.`
        )
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Phase 144: Enforces feature gating flags based on plan tier.
 */
export const requireFeature = (featureKey: string) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) return next();

      const sub = await TenantSubscription.findOne({ tenantId });
      if (!sub) {
        return next();
      }

      if (sub.status === 'Cancelled') {
        return next(new ApiError(403, 'Subscription is cancelled. Access denied.'));
      }

      const features: any = sub.featuresEnabled || {};
      if (!features[featureKey]) {
        return next(
          new ApiError(
            403,
            `Feature '${featureKey}' is not enabled on your current '${sub.planTier}' plan. Please upgrade your plan.`
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

