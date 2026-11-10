import mongoose from 'mongoose';

export type NotificationCategory =
  | 'tasks'
  | 'billing'
  | 'documents'
  | 'dsc_vault'
  | 'attendance'
  | 'security'
  | 'subscription';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export type NotificationChannel = 'in_app' | 'email' | 'whatsapp' | 'sms' | 'push';

export interface NotificationRecipient {
  userId: mongoose.Types.ObjectId;
  email?: string;
  name?: string;
  mobile?: string;
}

export interface NotificationDispatchPayload {
  tenantId: mongoose.Types.ObjectId;
  recipients: NotificationRecipient[];
  eventKey: string;
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message: string;
  link?: string;
  actorId?: mongoose.Types.ObjectId;
  actorName?: string;
  metadata?: Record<string, any>;
  isMandatory?: boolean;
}

export interface NotificationEventDefinition {
  eventKey: string;
  category: NotificationCategory;
  name: string;
  description: string;
  defaultInApp: boolean;
  defaultEmail: boolean;
  isMandatory: boolean;
  isPlatformLevel?: boolean; // For Platform Users (Super Admins)
}

