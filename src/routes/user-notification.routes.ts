import { Router } from 'express';
import {
  getInAppNotifications,
  getUnreadInAppCount,
  markInAppAsRead,
  markAllInAppAsRead,
  deleteInAppNotification,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  resetUserNotificationPreferences,
  getTenantNotificationPolicy,
  updateTenantNotificationPolicy
} from '../controllers/user-notification.controller';
import { authorize } from '../middlewares/authorize';

const router = Router();

// ─── In-App Notifications (All authenticated users) ───────────
router.get('/in-app', getInAppNotifications);
router.get('/in-app/unread-count', getUnreadInAppCount);
router.patch('/in-app/read-all', markAllInAppAsRead);
router.patch('/in-app/:id/read', markInAppAsRead);
router.delete('/in-app/:id', deleteInAppNotification);

// ─── Personal Notification Preferences (All authenticated users)
router.get('/preferences', getUserNotificationPreferences);
router.put('/preferences', updateUserNotificationPreferences);
router.post('/preferences/reset', resetUserNotificationPreferences);

// ─── Organization Notification Policies (Super Admin / Admin) ─
router.get(
  '/policy',
  authorize(['notification_settings:view', 'settings:view']),
  getTenantNotificationPolicy
);
router.put(
  '/policy',
  authorize(['notification_settings:manage', 'settings:manage']),
  updateTenantNotificationPolicy
);

export default router;

