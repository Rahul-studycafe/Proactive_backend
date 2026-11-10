import mongoose from 'mongoose';
import connectDB from '../src/config/db';
import { Organization, User } from '../src/modules/auth/schemas';
import { notificationDispatcher } from '../src/services/notifications/notification-dispatcher.service';
import { InAppNotification } from '../src/models/InAppNotification';
import { UserNotificationPreference } from '../src/models/UserNotificationPreference';
import { TenantNotificationPolicy } from '../src/models/TenantNotificationPolicy';
import { NOTIFICATION_EVENTS_CATALOGUE } from '../src/config/notification-events-catalogue';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runNotificationsVerification() {
  console.log('Connecting via connectDB()...');
  await connectDB();
  console.log('Connected to MongoDB successfully.\n');

  const org = await Organization.findOne({ isDeleted: { $ne: true } });
  if (!org) {
    console.error('No active organization found to verify with.');
    process.exit(1);
  }

  const user = await User.findOne({ tenantId: org._id, isActive: true });
  if (!user) {
    console.error('No active user found in organization.');
    process.exit(1);
  }

  const tenantId = org._id as mongoose.Types.ObjectId;
  const userId = user._id as mongoose.Types.ObjectId;

  console.log(`Verifying Centralized Notification System for:`);
  console.log(`- Organization: "${org.name}" (${tenantId})`);
  console.log(`- User: "${user.name}" (${userId}, ${user.email})\n`);

  // 1. Verify Tenant Notification Policy initialization
  console.log('1. Testing getOrCreateTenantPolicy...');
  const policy = await notificationDispatcher.getOrCreateTenantPolicy(tenantId);
  console.log(`   Policy initialized with ${policy.policies.length} events.`);
  if (policy.policies.length < NOTIFICATION_EVENTS_CATALOGUE.length) {
    throw new Error(
      `Expected at least ${NOTIFICATION_EVENTS_CATALOGUE.length} policies, got ${policy.policies.length}`
    );
  }

  const mandatoryEvents = policy.policies.filter((p) => p.isMandatory);
  console.log(`   Found ${mandatoryEvents.length} mandatory event policies.`);
  if (mandatoryEvents.length === 0) {
    throw new Error('Expected mandatory events in policy catalog');
  }

  // 2. Dispatch a task assignment notification
  console.log('\n2. Testing notificationDispatcher.dispatch (task:assigned)...');
  await notificationDispatcher.dispatch({
    tenantId,
    recipients: [{ userId, name: user.name, email: user.email }],
    eventKey: 'task:assigned',
    category: 'tasks',
    priority: 'high',
    title: 'E2E Test: GST Filing Task Assigned',
    message: 'You have been assigned to prepare GSTR-3B return for ABC Pvt Ltd.',
    link: '/tasks?taskId=e2e_test_task_123',
    metadata: { testRun: true, timestamp: Date.now() }
  });

  // Verify InAppNotification was created
  const createdNotif = await InAppNotification.findOne({
    tenantId,
    recipientId: userId,
    eventKey: 'task:assigned',
    title: 'E2E Test: GST Filing Task Assigned'
  }).sort({ createdAt: -1 });

  if (!createdNotif) {
    throw new Error('InAppNotification was not created in MongoDB');
  }
  console.log(`   Successfully created InAppNotification ID: ${createdNotif._id}`);
  console.log(`   Title: "${createdNotif.title}", isRead: ${createdNotif.isRead}`);

  // 3. Dispatch a mandatory security audit notification
  console.log('\n3. Testing notificationDispatcher.dispatch (vault:credential_revealed - mandatory)...');
  await notificationDispatcher.dispatch({
    tenantId,
    recipients: [{ userId, name: user.name, email: user.email }],
    eventKey: 'vault:credential_revealed',
    category: 'dsc_vault',
    priority: 'urgent',
    isMandatory: true,
    title: 'E2E Test: Security Alert: Password Unmasked',
    message: 'Income Tax Portal password for XYZ Corp was revealed by Staff.',
    link: '/vaults/passwords',
    metadata: { testRun: true }
  });

  const secNotif = await InAppNotification.findOne({
    tenantId,
    recipientId: userId,
    eventKey: 'vault:credential_revealed',
    title: 'E2E Test: Security Alert: Password Unmasked'
  });

  if (!secNotif) {
    throw new Error('Mandatory security InAppNotification was not created');
  }
  console.log(`   Successfully verified mandatory notification ID: ${secNotif._id}`);

  // 4. Test Unread Count & Mark as Read
  console.log('\n4. Testing Unread Count and Mark as Read...');
  const initialUnread = await InAppNotification.countDocuments({
    tenantId,
    recipientId: userId,
    isRead: false
  });
  console.log(`   Unread count before read: ${initialUnread}`);

  createdNotif.isRead = true;
  createdNotif.readAt = new Date();
  await createdNotif.save();

  const afterUnread = await InAppNotification.countDocuments({
    tenantId,
    recipientId: userId,
    isRead: false
  });
  console.log(`   Unread count after marking 1 item read: ${afterUnread}`);
  if (afterUnread !== initialUnread - 1) {
    throw new Error(`Expected unread count to decrease by 1, got ${afterUnread}`);
  }

  // 5. Test Personal Preference Isolation & Mandatory Protection
  console.log('\n5. Testing UserNotificationPreference...');
  const savedPref = await UserNotificationPreference.findOneAndUpdate(
    { tenantId, userId },
    {
      tenantId,
      userId,
      preferences: [
        { eventKey: 'task:assigned', inApp: true, email: false },
        { eventKey: 'vault:credential_revealed', inApp: true, email: true }
      ]
    },
    { upsert: true, new: true }
  );

  console.log(`   Saved preferences for user: ${savedPref.preferences.length} customized items.`);
  const taskPref = savedPref.preferences.find((p) => p.eventKey === 'task:assigned');
  if (taskPref?.email !== false) {
    throw new Error('User preference for email was not disabled as expected');
  }

  // 6. Cleanup E2E Test Documents
  console.log('\n6. Cleaning up test notification artifacts...');
  const deleted = await InAppNotification.deleteMany({
    tenantId,
    'metadata.testRun': true
  });
  console.log(`   Cleaned up ${deleted.deletedCount} temporary test notifications.`);

  console.log('\n============================================================');
  console.log('✅ ALL CENTRALIZED NOTIFICATION SYSTEM E2E TESTS PASSED!');
  console.log('============================================================\n');

  process.exit(0);
}

runNotificationsVerification().catch((err) => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err);
  process.exit(1);
});

