import { NotificationEventDefinition } from '../types/notification.types';

export const NOTIFICATION_EVENTS_CATALOGUE: NotificationEventDefinition[] = [
  // ─── 1. TASKS & WORKFLOWS ──────────────────────────────────
  {
    eventKey: 'task:assigned',
    category: 'tasks',
    name: 'Task Assigned',
    description: 'Triggered when a task is assigned to you or your team members',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: false
  },
  {
    eventKey: 'task:status_changed',
    category: 'tasks',
    name: 'Task Status Updated',
    description: 'Triggered when a task status moves to Under Review, Completed, or On Hold',
    defaultInApp: true,
    defaultEmail: false,
    isMandatory: false
  },
  {
    eventKey: 'task:subtask_assigned',
    category: 'tasks',
    name: 'Subtask Assigned',
    description: 'Triggered when a checklist subtask is assigned to you',
    defaultInApp: true,
    defaultEmail: false,
    isMandatory: false
  },
  {
    eventKey: 'task:deadline_approaching',
    category: 'tasks',
    name: 'Task Deadline Approaching',
    description: 'Reminder sent 24h & 48h before a task due date',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: false
  },
  {
    eventKey: 'task:overdue',
    category: 'tasks',
    name: 'Task Overdue Alert',
    description: 'Alert sent when an active task passes its statutory or target due date',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: false
  },

  // ─── 2. BILLING & INVOICES ────────────────────────────────
  {
    eventKey: 'invoice:created',
    category: 'billing',
    name: 'New Invoice Generated',
    description: 'Triggered when a tax invoice or proforma is created for a client',
    defaultInApp: true,
    defaultEmail: false,
    isMandatory: false
  },
  {
    eventKey: 'invoice:overdue',
    category: 'billing',
    name: 'Invoice Overdue Notice',
    description: 'Triggered when client invoices remain unpaid past the due date',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: false
  },
  {
    eventKey: 'payment:received',
    category: 'billing',
    name: 'Payment / Receipt Recorded',
    description: 'Triggered when client payment collections and invoice settlements are logged',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: false
  },

  // ─── 3. CLIENTS & CRM ─────────────────────────────────────
  {
    eventKey: 'client:created',
    category: 'documents',
    name: 'New Client Onboarded',
    description: 'Triggered when a new client profile is registered in the practice',
    defaultInApp: true,
    defaultEmail: false,
    isMandatory: false
  },
  {
    eventKey: 'client:assigned',
    category: 'documents',
    name: 'Client Account Assigned',
    description: 'Triggered when you are designated as the assigned account manager for a client',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: false
  },

  // ─── 4. DOCUMENTS & PHYSICAL IN/OUT ───────────────────────
  {
    eventKey: 'document:client_uploaded',
    category: 'documents',
    name: 'Client Uploaded Requested Document',
    description: 'Triggered when a client uploads files via secure document request link',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: true
  },
  {
    eventKey: 'physical_doc:received',
    category: 'documents',
    name: 'Physical Document Inward Logged',
    description: 'Triggered when original deeds, certificates or files are taken into office custody',
    defaultInApp: true,
    defaultEmail: false,
    isMandatory: false
  },
  {
    eventKey: 'physical_doc:handed_out',
    category: 'documents',
    name: 'Physical Document Outward Dispatched',
    description: 'Triggered when physical files are handed over to a client or third party',
    defaultInApp: true,
    defaultEmail: false,
    isMandatory: false
  },
  {
    eventKey: 'physical_doc:overdue_return',
    category: 'documents',
    name: 'Overdue Physical Document Return',
    description: 'Alert when a physical file handed out has exceeded its expected return date',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: false
  },

  // ─── 5. DSC & PASSWORD VAULT ──────────────────────────────
  {
    eventKey: 'dsc:registered',
    category: 'dsc_vault',
    name: 'New DSC Token Registered',
    description: 'Triggered when a client USB token is logged into office custody coordinates',
    defaultInApp: true,
    defaultEmail: false,
    isMandatory: false
  },
  {
    eventKey: 'dsc:handover',
    category: 'dsc_vault',
    name: 'DSC Token Handover / Transfer',
    description: 'Triggered when a digital signature token is handed over to a client or team member',
    defaultInApp: true,
    defaultEmail: false,
    isMandatory: false
  },
  {
    eventKey: 'dsc:expiry_alert',
    category: 'dsc_vault',
    name: 'DSC Expiry Approaching',
    description: 'Urgent compliance alert at 30, 15, 7, and 1 days prior to certificate expiry',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: true
  },
  {
    eventKey: 'vault:credential_revealed',
    category: 'dsc_vault',
    name: 'Vault Password Revealed (Security Audit)',
    description: 'Audit notice triggered whenever a statutory portal password is unmasked',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: true
  },
  {
    eventKey: 'vault:credential_updated',
    category: 'dsc_vault',
    name: 'Portal Credentials Updated',
    description: 'Notice when portal credentials or login details are modified',
    defaultInApp: true,
    defaultEmail: false,
    isMandatory: false
  },

  // ─── 6. HR & ATTENDANCE ───────────────────────────────────
  {
    eventKey: 'attendance:punch_missed',
    category: 'attendance',
    name: 'Missed Web Punch Alert',
    description: 'Reminder when a working day punch has not been recorded by designated office hours',
    defaultInApp: true,
    defaultEmail: false,
    isMandatory: false
  },
  {
    eventKey: 'attendance:manual_adjusted',
    category: 'attendance',
    name: 'Attendance Adjusted by Manager',
    description: 'Notice when an admin or manager manually overrides or logs attendance punches',
    defaultInApp: true,
    defaultEmail: false,
    isMandatory: false
  },

  // ─── 7. STAFF & SECURITY ──────────────────────────────────
  {
    eventKey: 'user:invite_accepted',
    category: 'security',
    name: 'Team Member Joined Firm',
    description: 'Triggered when an invited employee activates their account and sets password',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: false
  },
  {
    eventKey: 'user:role_changed',
    category: 'security',
    name: 'Account Role & Permissions Modified',
    description: 'Critical security notification when user role assignments are altered',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: true
  },
  {
    eventKey: 'user:deactivated',
    category: 'security',
    name: 'Staff Account Deactivated',
    description: 'Security notice when an employee account is disabled or deactivated',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: true
  },

  // ─── 8. SUBSCRIPTION & SAAS (SUPER ADMINS) ────────────────
  {
    eventKey: 'saas:subscription_renewed',
    category: 'subscription',
    name: 'Subscription Payment Processed',
    description: 'Invoice and renewal confirmation for practice software subscription',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: true,
    isPlatformLevel: true
  },
  {
    eventKey: 'saas:seat_limit_warning',
    category: 'subscription',
    name: 'Subscription Seat Capacity Alert',
    description: 'Alert when active staff count approaches total purchased seat limit',
    defaultInApp: true,
    defaultEmail: true,
    isMandatory: false,
    isPlatformLevel: true
  }
];

export const NOTIFICATION_CATEGORIES_METADATA = [
  { key: 'tasks', label: 'Tasks & Workflows', icon: 'CheckSquare' },
  { key: 'billing', label: 'Billing, Invoices & Receipts', icon: 'Receipt' },
  { key: 'documents', label: 'Clients & Documents', icon: 'FolderArchive' },
  { key: 'dsc_vault', label: 'DSC & Password Vault', icon: 'Key' },
  { key: 'attendance', label: 'HR & Attendance', icon: 'CalendarCheck' },
  { key: 'security', label: 'Security & Staff Administration', icon: 'ShieldCheck' },
  { key: 'subscription', label: 'Firm Subscription & SaaS', icon: 'Zap' }
] as const;

