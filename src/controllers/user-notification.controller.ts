import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import { InAppNotification } from '../models/InAppNotification';
import { UserNotificationPreference } from '../models/UserNotificationPreference';
import { TenantNotificationPolicy } from '../models/TenantNotificationPolicy';
import { notificationDispatcher } from '../services/notifications/notification-dispatcher.service';
import { NOTIFICATION_EVENTS_CATALOGUE } from '../config/notification-events-catalogue';

// ─── 1. In-App Notifications (Bell Popover) ───────────────────

/**
 * Fetch paginated in-app notifications for current authenticated user
 */
export const getInAppNotifications = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const tenantId = req.tenantId;

    if (!userId || !tenantId) {
      throw new ApiError(401, 'User context not found');
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const unreadOnly = req.query.unreadOnly === 'true';
    const category = req.query.category as string;

    const filter: Record<string, any> = {
      tenantId,
      recipientId: userId
    };

    if (unreadOnly) {
      filter.isRead = false;
    }
    if (category) {
      filter.category = category;
    }

    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      InAppNotification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      InAppNotification.countDocuments(filter),
      InAppNotification.countDocuments({
        tenantId,
        recipientId: userId,
        isRead: false
      })
    ]);

    sendSuccess(res, 200, 'Notifications retrieved successfully', {
      notifications,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  }
);

/**
 * Lightweight endpoint for TopBar badge count
 */
export const getUnreadInAppCount = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const tenantId = req.tenantId;

    if (!userId || !tenantId) {
      throw new ApiError(401, 'User context not found');
    }

    const unreadCount = await InAppNotification.countDocuments({
      tenantId,
      recipientId: userId,
      isRead: false
    });

    sendSuccess(res, 200, 'Unread count retrieved', { unreadCount });
  }
);

/**
 * Mark a single in-app notification as read
 */
export const markInAppAsRead = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const userId = req.user?._id;
    const tenantId = req.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Invalid notification ID');
    }

    const notification = await InAppNotification.findOneAndUpdate(
      {
        _id: id,
        tenantId,
        recipientId: userId
      },
      {
        isRead: true,
        readAt: new Date()
      },
      { new: true }
    );

    if (!notification) {
      throw new ApiError(404, 'Notification not found');
    }

    sendSuccess(res, 200, 'Notification marked as read', notification);
  }
);

/**
 * Mark all notifications as read for current user
 */
export const markAllInAppAsRead = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const tenantId = req.tenantId;

    await InAppNotification.updateMany(
      {
        tenantId,
        recipientId: userId,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );

    sendSuccess(res, 200, 'All notifications marked as read');
  }
);

/**
 * Delete a single notification
 */
export const deleteInAppNotification = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const userId = req.user?._id;
    const tenantId = req.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Invalid notification ID');
    }

    const deleted = await InAppNotification.findOneAndDelete({
      _id: id,
      tenantId,
      recipientId: userId
    });

    if (!deleted) {
      throw new ApiError(404, 'Notification not found');
    }

    sendSuccess(res, 200, 'Notification removed');
  }
);

// ─── 2. Personal Notification Preferences ─────────────────────

/**
 * Get effective personal notification preferences (merged with tenant policy)
 */
export const getUserNotificationPreferences = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const tenantId = req.tenantId as mongoose.Types.ObjectId;

    if (!userId || !tenantId) {
      throw new ApiError(401, 'User context not found');
    }

    const [orgPolicy, userPrefDoc] = await Promise.all([
      notificationDispatcher.getOrCreateTenantPolicy(tenantId),
      UserNotificationPreference.findOne({ tenantId, userId }).lean()
    ]);

    const userPrefMap = new Map<string, any>();
    if (userPrefDoc?.preferences) {
      userPrefDoc.preferences.forEach((p) => userPrefMap.set(p.eventKey, p));
    }

    // Merge catalog + tenant policy + user preference
    const effectivePreferences = orgPolicy.policies.map((policy) => {
      const userPref = userPrefMap.get(policy.eventKey);
      const isMandatory = policy.isMandatory;

      return {
        eventKey: policy.eventKey,
        category: policy.category,
        name: policy.name,
        description: policy.description,
        isEnabled: policy.isEnabled,
        isMandatory,
        inApp: isMandatory ? true : userPref ? userPref.inApp : policy.defaultInApp,
        email: isMandatory ? true : userPref ? userPref.email : policy.defaultEmail,
        whatsapp: userPref ? userPref.whatsapp ?? false : policy.defaultWhatsapp ?? false,
        sms: userPref ? userPref.sms ?? false : policy.defaultSms ?? false
      };
    });

    sendSuccess(res, 200, 'User notification preferences retrieved', {
      preferences: effectivePreferences
    });
  }
);

const updatePreferenceSchema = z.object({
  preferences: z.array(
    z.object({
      eventKey: z.string(),
      inApp: z.boolean(),
      email: z.boolean(),
      whatsapp: z.boolean().optional(),
      sms: z.boolean().optional()
    })
  )
});

/**
 * Update personal notification preferences
 */
export const updateUserNotificationPreferences = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const tenantId = req.tenantId as mongoose.Types.ObjectId;

    if (!userId || !tenantId) {
      throw new ApiError(401, 'User context not found');
    }

    const { preferences } = updatePreferenceSchema.parse(req.body);

    // Fetch org policy to safeguard mandatory notifications
    const orgPolicy = await notificationDispatcher.getOrCreateTenantPolicy(tenantId);
    const policyMap = new Map<string, any>();
    orgPolicy.policies.forEach((p) => policyMap.set(p.eventKey, p));

    // Sanitize: mandatory notifications cannot be turned off
    const sanitizedPreferences = preferences.map((item) => {
      const policy = policyMap.get(item.eventKey);
      if (policy?.isMandatory) {
        return {
          ...item,
          inApp: true,
          email: true
        };
      }
      return item;
    });

    const updatedDoc = await UserNotificationPreference.findOneAndUpdate(
      { tenantId, userId },
      {
        tenantId,
        userId,
        preferences: sanitizedPreferences
      },
      { upsert: true, new: true }
    );

    sendSuccess(res, 200, 'Notification preferences updated successfully', updatedDoc);
  }
);

/**
 * Reset personal notification preferences to tenant policy defaults
 */
export const resetUserNotificationPreferences = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const tenantId = req.tenantId as mongoose.Types.ObjectId;

    if (!userId || !tenantId) {
      throw new ApiError(401, 'User context not found');
    }

    await UserNotificationPreference.findOneAndDelete({ tenantId, userId });

    sendSuccess(res, 200, 'Preferences reset to organization defaults');
  }
);

// ─── 3. Organization Notification Policies (Super Admin / Admin)

/**
 * Get tenant-wide notification policy
 */
export const getTenantNotificationPolicy = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantId = req.tenantId as mongoose.Types.ObjectId;
    if (!tenantId) {
      throw new ApiError(401, 'Tenant context not found');
    }

    const policy = await notificationDispatcher.getOrCreateTenantPolicy(tenantId);
    sendSuccess(res, 200, 'Tenant notification policy retrieved', policy);
  }
);

const updatePolicySchema = z.object({
  policies: z.array(
    z.object({
      eventKey: z.string(),
      category: z.string(),
      name: z.string(),
      description: z.string().optional(),
      isMandatory: z.boolean(),
      isEnabled: z.boolean(),
      defaultInApp: z.boolean(),
      defaultEmail: z.boolean(),
      defaultWhatsapp: z.boolean().optional(),
      defaultSms: z.boolean().optional()
    })
  )
});

/**
 * Update tenant-wide notification policy
 */
export const updateTenantNotificationPolicy = asyncHandler(
  async (req: Request, res: Response) => {
    const tenantId = req.tenantId as mongoose.Types.ObjectId;
    if (!tenantId) {
      throw new ApiError(401, 'Tenant context not found');
    }

    const { policies } = updatePolicySchema.parse(req.body);

    const updated = await TenantNotificationPolicy.findOneAndUpdate(
      { tenantId },
      { policies },
      { new: true, upsert: true }
    );

    sendSuccess(res, 200, 'Tenant notification policy updated successfully', updated);
  }
);
