export type ScopeType = 'everything' | 'assigned_only' | 'team_only';

export interface PermissionDefinition {
  id: string;               // e.g. "client:create"
  resource: string;         // e.g. "client"
  action: string;           // e.g. "create"
  name: string;             // Human-readable title
  description: string;      // Operational description
  category: string;         // UI category grouping
  supportsScope: boolean;   // Whether scope (everything / team_only / assigned_only) applies
  isDangerous?: boolean;    // Destructive actions requiring caution
}

export const PERMISSION_CATEGORIES = [
  'Clients & CRM',
  'Tasks & Workflows',
  'Billing & Invoices',
  'Quotations',
  'Receipts & Payments',
  'Expenses & Outlays',
  'Services & Packages',
  'DSC Management',
  'Password Vault',
  'Documents',
  'HR & Attendance',
  'Reports & Analytics',
  'Firm Administration'
] as const;

export const PERMISSION_CATALOGUE: PermissionDefinition[] = [
  // ─── 1. CLIENTS & CRM ─────────────────────────────────────
  { id: 'client:view', resource: 'client', action: 'view', name: 'View Clients', description: 'Browse and view client master profiles', category: 'Clients & CRM', supportsScope: true },
  { id: 'client:create', resource: 'client', action: 'create', name: 'Create Client', description: 'Register new clients in the firm', category: 'Clients & CRM', supportsScope: false },
  { id: 'client:edit', resource: 'client', action: 'edit', name: 'Edit Client', description: 'Update client details, contact info and addresses', category: 'Clients & CRM', supportsScope: true },
  { id: 'client:delete', resource: 'client', action: 'delete', name: 'Delete Client', description: 'Remove client profiles permanently', category: 'Clients & CRM', supportsScope: false, isDangerous: true },
  { id: 'client:portal_manage', resource: 'client', action: 'portal_manage', name: 'Manage Portal Users', description: 'Create and manage client portal user accounts & passwords', category: 'Clients & CRM', supportsScope: true },
  { id: 'client:services_manage', resource: 'client', action: 'services_manage', name: 'Manage Subscribed Services', description: 'Subscribe or unsubscribe clients from services', category: 'Clients & CRM', supportsScope: true },
  { id: 'client:packages_manage', resource: 'client', action: 'packages_manage', name: 'Manage Subscribed Packages', description: 'Assign commercial packages to clients', category: 'Clients & CRM', supportsScope: true },

  // ─── 2. TASKS & WORKFLOWS ─────────────────────────────────
  { id: 'task:view', resource: 'task', action: 'view', name: 'View Tasks', description: 'View assigned or firm-wide operational tasks', category: 'Tasks & Workflows', supportsScope: true },
  { id: 'task:create', resource: 'task', action: 'create', name: 'Create Task', description: 'Create new compliance and advisory tasks', category: 'Tasks & Workflows', supportsScope: false },
  { id: 'task:edit', resource: 'task', action: 'edit', name: 'Edit Task', description: 'Update task progress, status, checklist and subtasks', category: 'Tasks & Workflows', supportsScope: true },
  { id: 'task:delete', resource: 'task', action: 'delete', name: 'Delete Task', description: 'Delete tasks', category: 'Tasks & Workflows', supportsScope: false, isDangerous: true },
  { id: 'task:assign', resource: 'task', action: 'assign', name: 'Assign Tasks', description: 'Assign tasks to other team members', category: 'Tasks & Workflows', supportsScope: true },
  { id: 'task:verify', resource: 'task', action: 'verify', name: 'Verify Task Compliance', description: 'Sign-off and verify completed tasks', category: 'Tasks & Workflows', supportsScope: true },
  { id: 'task:delete_note', resource: 'task', action: 'delete_note', name: 'Delete Task Notes', description: 'Remove comments and notes from tasks', category: 'Tasks & Workflows', supportsScope: true, isDangerous: true },
  { id: 'automation:run', resource: 'automation', action: 'run', name: 'Run / Trigger Automations', description: 'Manually trigger recurring task automations, cron schedules and batch blueprints', category: 'Tasks & Workflows', supportsScope: false },

  // ─── 3. BILLING & INVOICES ────────────────────────────────
  { id: 'invoice:view', resource: 'invoice', action: 'view', name: 'View Invoices', description: 'Browse and view billing records', category: 'Billing & Invoices', supportsScope: true },
  { id: 'invoice:create', resource: 'invoice', action: 'create', name: 'Create Invoice', description: 'Generate tax invoices', category: 'Billing & Invoices', supportsScope: false },
  { id: 'invoice:edit', resource: 'invoice', action: 'edit', name: 'Edit Invoice', description: 'Modify draft invoices', category: 'Billing & Invoices', supportsScope: false },
  { id: 'invoice:delete', resource: 'invoice', action: 'delete', name: 'Delete Invoice', description: 'Cancel or delete invoices', category: 'Billing & Invoices', supportsScope: false, isDangerous: true },
  { id: 'invoice:send', resource: 'invoice', action: 'send', name: 'Send Invoice', description: 'Dispatch invoices via Email or WhatsApp', category: 'Billing & Invoices', supportsScope: false },
  { id: 'credit_note:view', resource: 'credit_note', action: 'view', name: 'View Credit Notes', description: 'Browse and view credit notes directory', category: 'Billing & Invoices', supportsScope: true },
  { id: 'credit_note:create', resource: 'credit_note', action: 'create', name: 'Create Credit Note', description: 'Issue credit notes against invoices', category: 'Billing & Invoices', supportsScope: false },

  // ─── 4. QUOTATIONS ────────────────────────────────────────
  { id: 'quotation:view', resource: 'quotation', action: 'view', name: 'View Quotations', description: 'View client fee proposals and quotations', category: 'Quotations', supportsScope: true },
  { id: 'quotation:create', resource: 'quotation', action: 'create', name: 'Create Quotation', description: 'Draft new quotations', category: 'Quotations', supportsScope: false },
  { id: 'quotation:edit', resource: 'quotation', action: 'edit', name: 'Edit Quotation', description: 'Update quotation terms, line items and rates', category: 'Quotations', supportsScope: false },
  { id: 'quotation:delete', resource: 'quotation', action: 'delete', name: 'Delete Quotation', description: 'Delete quotations', category: 'Quotations', supportsScope: false, isDangerous: true },
  { id: 'quotation:send', resource: 'quotation', action: 'send', name: 'Send Quotation', description: 'Email quotations directly to prospective clients', category: 'Quotations', supportsScope: false },

  // ─── 5. RECEIPTS & PAYMENTS ───────────────────────────────
  { id: 'receipt:view', resource: 'receipt', action: 'view', name: 'View Receipts', description: 'View payment collections and settlement history', category: 'Receipts & Payments', supportsScope: true },
  { id: 'receipt:create', resource: 'receipt', action: 'create', name: 'Create Receipt', description: 'Log client payments and invoice settlements', category: 'Receipts & Payments', supportsScope: false },
  { id: 'receipt:edit', resource: 'receipt', action: 'edit', name: 'Edit Receipt', description: 'Update recorded receipt details', category: 'Receipts & Payments', supportsScope: false },
  { id: 'receipt:delete', resource: 'receipt', action: 'delete', name: 'Delete Receipt', description: 'Cancel receipts', category: 'Receipts & Payments', supportsScope: false, isDangerous: true },

  // ─── 6. EXPENSES & OUTLAYS ────────────────────────────────
  { id: 'expense:view', resource: 'expense', action: 'view', name: 'View Expenses', description: 'View practice outlays and reimbursable expenses', category: 'Expenses & Outlays', supportsScope: true },
  { id: 'expense:create', resource: 'expense', action: 'create', name: 'Create Expense', description: 'Log government challans, stamp duties and court outlays', category: 'Expenses & Outlays', supportsScope: false },
  { id: 'expense:edit', resource: 'expense', action: 'edit', name: 'Edit Expense', description: 'Update recorded expenses', category: 'Expenses & Outlays', supportsScope: false },
  { id: 'expense:delete', resource: 'expense', action: 'delete', name: 'Delete Expense', description: 'Delete recorded expenses', category: 'Expenses & Outlays', supportsScope: false, isDangerous: true },

  // ─── 7. SERVICES & PACKAGES ───────────────────────────────
  { id: 'service:view', resource: 'service', action: 'view', name: 'View Services', description: 'View operational blueprint services', category: 'Services & Packages', supportsScope: false },
  { id: 'service:create', resource: 'service', action: 'create', name: 'Create Service', description: 'Define new blueprint services with checklist & subtasks', category: 'Services & Packages', supportsScope: false },
  { id: 'service:edit', resource: 'service', action: 'edit', name: 'Edit Service', description: 'Modify blueprint checklist, frequency & pricing', category: 'Services & Packages', supportsScope: false },
  { id: 'service:delete', resource: 'service', action: 'delete', name: 'Delete Service', description: 'Remove blueprint services', category: 'Services & Packages', supportsScope: false, isDangerous: true },
  { id: 'package:view', resource: 'package', action: 'view', name: 'View Packages', description: 'View commercial service packages', category: 'Services & Packages', supportsScope: false },
  { id: 'package:create', resource: 'package', action: 'create', name: 'Create Package', description: 'Bundle multiple services into commercial packages', category: 'Services & Packages', supportsScope: false },
  { id: 'package:edit', resource: 'package', action: 'edit', name: 'Edit Package', description: 'Update package pricing and service inclusions', category: 'Services & Packages', supportsScope: false },
  { id: 'package:delete', resource: 'package', action: 'delete', name: 'Delete Package', description: 'Delete commercial packages', category: 'Services & Packages', supportsScope: false, isDangerous: true },

  // ─── 8. DSC MANAGEMENT ────────────────────────────────────
  { id: 'dsc:view', resource: 'dsc', action: 'view', name: 'View DSC', description: 'View Digital Signature Certificate registry and expiry alerts', category: 'DSC Management', supportsScope: true },
  { id: 'dsc:create', resource: 'dsc', action: 'create', name: 'Register DSC', description: 'Register new client digital signatures', category: 'DSC Management', supportsScope: false },
  { id: 'dsc:edit', resource: 'dsc', action: 'edit', name: 'Edit DSC', description: 'Update DSC physical locations, passwords and renewals', category: 'DSC Management', supportsScope: false },
  { id: 'dsc:delete', resource: 'dsc', action: 'delete', name: 'Delete DSC', description: 'Remove DSC records from registry', category: 'DSC Management', supportsScope: false, isDangerous: true },

  // ─── 9. PASSWORD VAULT ────────────────────────────────────
  { id: 'vault:view', resource: 'vault', action: 'view', name: 'View Credentials', description: 'Access stored client compliance credentials', category: 'Password Vault', supportsScope: true },
  { id: 'vault:create', resource: 'vault', action: 'create', name: 'Store Credentials', description: 'Add new compliance portal credentials', category: 'Password Vault', supportsScope: false },
  { id: 'vault:edit', resource: 'vault', action: 'edit', name: 'Edit Credentials', description: 'Update stored portal usernames and passwords', category: 'Password Vault', supportsScope: false },
  { id: 'vault:delete', resource: 'vault', action: 'delete', name: 'Delete Credentials', description: 'Remove credentials from vault', category: 'Password Vault', supportsScope: false, isDangerous: true },

  // ─── 10. DOCUMENTS ────────────────────────────────────────
  { id: 'document:view', resource: 'document', action: 'view', name: 'View Documents', description: 'Browse and download client files and attachments', category: 'Documents', supportsScope: true },
  { id: 'document:create', resource: 'document', action: 'create', name: 'Upload Documents', description: 'Upload compliance documents and attachments', category: 'Documents', supportsScope: false },
  { id: 'document:delete', resource: 'document', action: 'delete', name: 'Delete Documents', description: 'Delete uploaded documents', category: 'Documents', supportsScope: false, isDangerous: true },
  { id: 'document:request', resource: 'document', action: 'request', name: 'Request Documents', description: 'Send automated document collection requests to clients', category: 'Documents', supportsScope: false },
  { id: 'document:physical_manage', resource: 'document', action: 'physical_manage', name: 'Physical Doc In/Out', description: 'Track physical file movements in and out of the office', category: 'Documents', supportsScope: false },

  // ─── 11. HR & ATTENDANCE ──────────────────────────────────
  { id: 'attendance:view_self', resource: 'attendance', action: 'view_self', name: 'View Own Attendance', description: 'View personal daily punch records, active work duration and clock in/out desk', category: 'HR & Attendance', supportsScope: false },
  { id: 'attendance:view_all', resource: 'attendance', action: 'view_all', name: 'View Firm Attendance Desk', description: 'View live presence, daily operations desk and staff roster', category: 'HR & Attendance', supportsScope: false },
  { id: 'attendance:matrix_view_self', resource: 'attendance', action: 'matrix_view_self', name: 'View Own Monthly Matrix', description: 'View personal 31-day attendance matrix calendar and monthly summary', category: 'HR & Attendance', supportsScope: false },
  { id: 'attendance:matrix_view', resource: 'attendance', action: 'matrix_view', name: 'View Monthly Matrix', description: 'View 31-day visual firm attendance matrix grid for all employees', category: 'HR & Attendance', supportsScope: false },
  { id: 'attendance:manual_entry', resource: 'attendance', action: 'manual_entry', name: 'Add Manual Attendance Entry', description: 'Record manual attendance entries and adjust staff punch records', category: 'HR & Attendance', supportsScope: false },
  { id: 'attendance:export_payroll', resource: 'attendance', action: 'export_payroll', name: 'Export Payroll / Attendance Data', description: 'Download attendance and payroll reports to CSV and Excel', category: 'HR & Attendance', supportsScope: false },
  { id: 'attendance:manage', resource: 'attendance', action: 'manage', name: 'Manage Attendance Policies', description: 'Configure weekend rules, office perimeters and working days', category: 'HR & Attendance', supportsScope: false },

  // ─── 12. REPORTS & BUSINESS INTELLIGENCE ──────────────────
  { id: 'report:view', resource: 'report', action: 'view', name: 'View Reports', description: 'Access operational, task velocity and aging reports', category: 'Reports & Analytics', supportsScope: false },
  { id: 'report:export', resource: 'report', action: 'export', name: 'Export Reports', description: 'Download business intelligence data to Excel and PDF', category: 'Reports & Analytics', supportsScope: false },

  // ─── 13. FIRM ADMINISTRATION ─────────────────────────────
  { id: 'user:view', resource: 'user', action: 'view', name: 'View Staff', description: 'View firm members and employee profiles', category: 'Firm Administration', supportsScope: false },
  { id: 'user:create', resource: 'user', action: 'create', name: 'Invite Staff', description: 'Add new staff members within subscription seat limit', category: 'Firm Administration', supportsScope: false },
  { id: 'user:edit', resource: 'user', action: 'edit', name: 'Edit Staff', description: 'Update staff member profile details and role assignments', category: 'Firm Administration', supportsScope: false },
  { id: 'user:delete', resource: 'user', action: 'delete', name: 'Deactivate Staff', description: 'Deactivate staff member accounts', category: 'Firm Administration', supportsScope: false, isDangerous: true },
  { id: 'role:view', resource: 'role', action: 'view', name: 'View Roles & Permissions', description: 'View tenant role configurations', category: 'Firm Administration', supportsScope: false },
  { id: 'role:manage', resource: 'role', action: 'manage', name: 'Manage Roles', description: 'Create, customize and delete tenant roles', category: 'Firm Administration', supportsScope: false },
  { id: 'settings:view', resource: 'settings', action: 'view', name: 'View Settings', description: 'Access firm settings hub', category: 'Firm Administration', supportsScope: false },
  { id: 'settings:manage', resource: 'settings', action: 'manage', name: 'Manage Firm Settings', description: 'Configure billing entities, payment gateways, automation triggers', category: 'Firm Administration', supportsScope: false },
  { id: 'configuration:view', resource: 'configuration', action: 'view', name: 'View Configurations', description: 'Browse and search configured dropdown values', category: 'Firm Administration', supportsScope: false },
  { id: 'configuration:create', resource: 'configuration', action: 'create', name: 'Add Configuration Options', description: 'Add new options to dropdowns and taxonomy catalogs', category: 'Firm Administration', supportsScope: false },
  { id: 'configuration:update', resource: 'configuration', action: 'update', name: 'Update Configurations', description: 'Edit labels, descriptions, and active status of dropdown options', category: 'Firm Administration', supportsScope: false },
  { id: 'configuration:delete', resource: 'configuration', action: 'delete', name: 'Delete Configurations', description: 'Delete or deactivate unused dropdown options', category: 'Firm Administration', supportsScope: false, isDangerous: true },
  { id: 'notification_settings:view', resource: 'notification_settings', action: 'view', name: 'View Notification Settings', description: 'View firm notification policies and channel options', category: 'Firm Administration', supportsScope: false },
  { id: 'notification_settings:manage', resource: 'notification_settings', action: 'manage', name: 'Manage Notification Policies', description: 'Configure organization-level notification defaults and mandatory alerts', category: 'Firm Administration', supportsScope: false, isDangerous: true }
];

export interface RoleBlueprint {
  name: string;
  description: string;
  isSuperAdmin: boolean;
  isSystemDefault: boolean;
  permissions: Record<string, { allowed: boolean; scope: ScopeType }>;
}

/**
 * Returns the default seed blueprints for any tenant.
 * Includes the requested CA practice hierarchy roles:
 * - Super Admin (unrestricted owner)
 * - Senior Manager
 * - Manager
 * - Senior Associate
 * - Associate
 * - Qualified Chartered Accountant
 * - Semi-Qualified CA
 * - Article Assistant
 * - Accountant
 * - Office Administrator
 * - HR Executive
 * (and Admin / Staff for backward compatibility)
 */
export function getDefaultRoleBlueprints(): RoleBlueprint[] {
  // Helper to build permission record
  const createPerms = (
    fn: (p: PermissionDefinition) => { allowed: boolean; scope?: ScopeType }
  ): Record<string, { allowed: boolean; scope: ScopeType }> => {
    const map: Record<string, { allowed: boolean; scope: ScopeType }> = {};
    PERMISSION_CATALOGUE.forEach((p) => {
      const res = fn(p);
      map[p.id] = {
        allowed: res.allowed,
        scope: res.scope || 'everything',
      };
    });
    return map;
  };

  // 1. Super Admin (Unrestricted)
  const superAdminPerms = createPerms(() => ({ allowed: true, scope: 'everything' }));

  // 2. Admin (Full Firm Manager)
  const adminPerms = createPerms((p) => ({
    allowed: !p.isDangerous || p.id === 'user:delete' ? false : !p.isDangerous,
    scope: 'everything',
  }));

  // 3. Senior Manager (Executive practice manager overseeing clients, tasks, delegation, and billing)
  const seniorManagerPerms = createPerms((p) => {
    if (p.isDangerous) return { allowed: false, scope: 'everything' };
    const allowed =
      p.resource === 'client' ||
      p.resource === 'task' ||
      p.resource === 'invoice' ||
      p.resource === 'credit_note' ||
      p.resource === 'quotation' ||
      p.resource === 'receipt' ||
      p.resource === 'expense' ||
      p.resource === 'service' ||
      p.resource === 'package' ||
      p.resource === 'dsc' ||
      p.resource === 'vault' ||
      p.resource === 'document' ||
      p.resource === 'configuration' ||
      p.id === 'automation:run' ||
      p.id === 'report:view' ||
      p.id === 'report:export' ||
      p.id === 'attendance:view_self' ||
      p.id === 'attendance:view_all' ||
      p.id === 'attendance:matrix_view_self' ||
      p.id === 'attendance:matrix_view' ||
      p.id === 'attendance:manual_entry' ||
      p.id === 'attendance:export_payroll' ||
      p.id === 'user:view' ||
      p.id === 'user:create' ||
      p.id === 'user:edit' ||
      p.id === 'role:view' ||
      p.id === 'settings:view' ||
      p.id === 'notification_settings:view';
    return { allowed, scope: 'everything' };
  });

  // 4. Manager (Engagement manager directing execution, assignments, compliance sign-offs)
  const managerPerms = createPerms((p) => {
    if (p.isDangerous) return { allowed: false, scope: 'everything' };
    const allowed =
      p.id === 'client:view' ||
      p.id === 'client:create' ||
      p.id === 'client:edit' ||
      p.id === 'client:portal_manage' ||
      p.id === 'client:services_manage' ||
      p.id === 'client:packages_manage' ||
      p.id === 'task:view' ||
      p.id === 'task:create' ||
      p.id === 'task:edit' ||
      p.id === 'task:assign' ||
      p.id === 'task:verify' ||
      p.id === 'automation:run' ||
      p.id === 'invoice:view' ||
      p.id === 'invoice:create' ||
      p.id === 'invoice:send' ||
      p.id === 'credit_note:view' ||
      p.id === 'quotation:view' ||
      p.id === 'quotation:create' ||
      p.id === 'quotation:send' ||
      p.id === 'receipt:view' ||
      p.id === 'receipt:create' ||
      p.id === 'expense:view' ||
      p.id === 'expense:create' ||
      p.id === 'service:view' ||
      p.id === 'package:view' ||
      p.id === 'dsc:view' ||
      p.id === 'dsc:create' ||
      p.id === 'dsc:edit' ||
      p.id === 'vault:view' ||
      p.id === 'vault:create' ||
      p.id === 'vault:edit' ||
      p.id === 'document:view' ||
      p.id === 'document:create' ||
      p.id === 'document:request' ||
      p.id === 'document:physical_manage' ||
      p.id === 'attendance:view_self' ||
      p.id === 'attendance:view_all' ||
      p.id === 'attendance:matrix_view_self' ||
      p.id === 'attendance:matrix_view' ||
      p.id === 'report:view' ||
      p.id === 'report:export' ||
      p.id === 'user:view' ||
      p.id === 'configuration:view' ||
      p.id === 'settings:view';
    return { allowed, scope: 'everything' };
  });

  // 5. Senior Associate (Experienced auditor/compliance practitioner)
  const seniorAssociatePerms = createPerms((p) => {
    if (p.isDangerous) return { allowed: false, scope: 'everything' };
    if (p.id === 'client:view' || p.id === 'client:edit') return { allowed: true, scope: 'everything' };
    if (p.id === 'task:view' || p.id === 'task:create' || p.id === 'task:edit' || p.id === 'task:verify') return { allowed: true, scope: 'everything' };
    if (p.id === 'task:assign') return { allowed: true, scope: 'team_only' };
    if (p.id === 'invoice:view' || p.id === 'invoice:create') return { allowed: true, scope: 'everything' };
    if (p.id === 'quotation:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'receipt:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'expense:view' || p.id === 'expense:create') return { allowed: true, scope: 'everything' };
    if (p.id === 'service:view' || p.id === 'package:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'dsc:view' || p.id === 'dsc:create' || p.id === 'dsc:edit') return { allowed: true, scope: 'everything' };
    if (p.id === 'vault:view' || p.id === 'vault:create') return { allowed: true, scope: 'everything' };
    if (p.id === 'document:view' || p.id === 'document:create' || p.id === 'document:request' || p.id === 'document:physical_manage') return { allowed: true, scope: 'everything' };
    if (p.id === 'attendance:view_self' || p.id === 'attendance:matrix_view_self') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'report:view' || p.id === 'configuration:view') return { allowed: true, scope: 'everything' };
    return { allowed: false, scope: 'assigned_only' };
  });

  // 6. Associate (Core compliance execution)
  const associatePerms = createPerms((p) => {
    if (p.isDangerous) return { allowed: false, scope: 'assigned_only' };
    if (p.id === 'client:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'task:view' || p.id === 'task:edit') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'task:create') return { allowed: true, scope: 'everything' };
    if (p.id === 'invoice:view') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'receipt:view') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'expense:view') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'expense:create') return { allowed: true, scope: 'everything' };
    if (p.id === 'service:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'dsc:view') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'vault:view') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'document:view' || p.id === 'document:create') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'attendance:view_self' || p.id === 'attendance:matrix_view_self') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'configuration:view') return { allowed: true, scope: 'everything' };
    return { allowed: false, scope: 'assigned_only' };
  });

  // 7. Qualified Chartered Accountant (Certified CA for audit, tax, statutory representation & sign-offs)
  const qualifiedCaPerms = createPerms((p) => {
    if (p.isDangerous) return { allowed: false, scope: 'everything' };
    const allowed =
      p.id === 'client:view' ||
      p.id === 'client:create' ||
      p.id === 'client:edit' ||
      p.id === 'client:services_manage' ||
      p.id === 'client:packages_manage' ||
      p.id === 'task:view' ||
      p.id === 'task:create' ||
      p.id === 'task:edit' ||
      p.id === 'task:assign' ||
      p.id === 'task:verify' ||
      p.id === 'automation:run' ||
      p.id === 'invoice:view' ||
      p.id === 'invoice:create' ||
      p.id === 'invoice:edit' ||
      p.id === 'invoice:send' ||
      p.id === 'credit_note:view' ||
      p.id === 'credit_note:create' ||
      p.id === 'quotation:view' ||
      p.id === 'quotation:create' ||
      p.id === 'receipt:view' ||
      p.id === 'receipt:create' ||
      p.id === 'expense:view' ||
      p.id === 'expense:create' ||
      p.id === 'expense:edit' ||
      p.id === 'service:view' ||
      p.id === 'package:view' ||
      p.id === 'dsc:view' ||
      p.id === 'dsc:create' ||
      p.id === 'dsc:edit' ||
      p.id === 'vault:view' ||
      p.id === 'vault:create' ||
      p.id === 'vault:edit' ||
      p.id === 'document:view' ||
      p.id === 'document:create' ||
      p.id === 'document:request' ||
      p.id === 'document:physical_manage' ||
      p.id === 'attendance:view_self' ||
      p.id === 'attendance:matrix_view_self' ||
      p.id === 'attendance:view_all' ||
      p.id === 'report:view' ||
      p.id === 'report:export' ||
      p.id === 'configuration:view' ||
      p.id === 'settings:view';
    return { allowed, scope: 'everything' };
  });

  // 8. Semi-Qualified CA (CA Inter/Finalist working on computations, TDS/GST and audits)
  const semiQualifiedCaPerms = createPerms((p) => {
    if (p.isDangerous) return { allowed: false, scope: 'everything' };
    if (p.id === 'client:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'client:edit') return { allowed: true, scope: 'team_only' };
    if (p.id === 'task:view' || p.id === 'task:create' || p.id === 'task:edit') return { allowed: true, scope: 'everything' };
    if (p.id === 'invoice:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'receipt:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'expense:view' || p.id === 'expense:create') return { allowed: true, scope: 'everything' };
    if (p.id === 'service:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'dsc:view' || p.id === 'dsc:create' || p.id === 'dsc:edit') return { allowed: true, scope: 'everything' };
    if (p.id === 'vault:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'document:view' || p.id === 'document:create' || p.id === 'document:request') return { allowed: true, scope: 'everything' };
    if (p.id === 'attendance:view_self' || p.id === 'attendance:matrix_view_self') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'report:view' || p.id === 'configuration:view') return { allowed: true, scope: 'everything' };
    return { allowed: false, scope: 'assigned_only' };
  });

  // 9. Article Assistant (ICAI Trainee executing field work and assigned compliance)
  const articleAssistantPerms = createPerms((p) => {
    if (p.id === 'client:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'task:view' || p.id === 'task:edit') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'task:create') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'dsc:view') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'vault:view') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'document:view' || p.id === 'document:create') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'attendance:view_self' || p.id === 'attendance:matrix_view_self') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'configuration:view') return { allowed: true, scope: 'everything' };
    return { allowed: false, scope: 'assigned_only' };
  });

  // 10. Accountant (Client billing, invoices, receipts, outlays, collections)
  const accountantPerms = createPerms((p) => {
    if (p.isDangerous) return { allowed: false, scope: 'everything' };
    const allowed =
      p.id === 'client:view' ||
      p.id === 'task:view' ||
      p.id === 'task:create' ||
      p.id === 'task:edit' ||
      p.id === 'invoice:view' ||
      p.id === 'invoice:create' ||
      p.id === 'invoice:edit' ||
      p.id === 'invoice:send' ||
      p.id === 'credit_note:view' ||
      p.id === 'credit_note:create' ||
      p.id === 'quotation:view' ||
      p.id === 'quotation:create' ||
      p.id === 'quotation:edit' ||
      p.id === 'quotation:send' ||
      p.id === 'receipt:view' ||
      p.id === 'receipt:create' ||
      p.id === 'receipt:edit' ||
      p.id === 'expense:view' ||
      p.id === 'expense:create' ||
      p.id === 'expense:edit' ||
      p.id === 'dsc:view' ||
      p.id === 'document:view' ||
      p.id === 'document:create' ||
      p.id === 'report:view' ||
      p.id === 'report:export' ||
      p.id === 'attendance:view_self' ||
      p.id === 'attendance:matrix_view_self' ||
      p.id === 'attendance:export_payroll' ||
      p.id === 'configuration:view' ||
      p.id === 'configuration:create';
    return { allowed, scope: 'everything' };
  });

  // 11. Office Administrator (Front desk, physical document movement, DSC management, office attendance)
  const officeAdminPerms = createPerms((p) => {
    if (p.isDangerous) return { allowed: false, scope: 'everything' };
    const allowed =
      p.id === 'client:view' ||
      p.id === 'client:create' ||
      p.id === 'client:edit' ||
      p.id === 'task:view' ||
      p.id === 'task:create' ||
      p.id === 'task:edit' ||
      p.id === 'invoice:view' ||
      p.id === 'receipt:view' ||
      p.id === 'receipt:create' ||
      p.id === 'expense:view' ||
      p.id === 'expense:create' ||
      p.id === 'dsc:view' ||
      p.id === 'dsc:create' ||
      p.id === 'dsc:edit' ||
      p.id === 'document:view' ||
      p.id === 'document:create' ||
      p.id === 'document:request' ||
      p.id === 'document:physical_manage' ||
      p.id === 'attendance:view_self' ||
      p.id === 'attendance:view_all' ||
      p.id === 'attendance:matrix_view_self' ||
      p.id === 'attendance:matrix_view' ||
      p.id === 'attendance:manual_entry' ||
      p.id === 'report:view' ||
      p.id === 'configuration:view' ||
      p.id === 'configuration:create' ||
      p.id === 'configuration:update' ||
      p.id === 'settings:view';
    return { allowed, scope: 'everything' };
  });

  // 12. HR Executive (HR & Attendance desk, staff records, payroll export, attendance policy)
  const hrExecutivePerms = createPerms((p) => {
    if (p.isDangerous && p.id !== 'notification_settings:manage') return { allowed: false, scope: 'everything' };
    const allowed =
      p.id === 'client:view' ||
      p.id === 'task:view' ||
      p.resource === 'attendance' ||
      p.id === 'user:view' ||
      p.id === 'user:create' ||
      p.id === 'user:edit' ||
      p.id === 'report:view' ||
      p.id === 'report:export' ||
      p.id === 'configuration:view' ||
      p.id === 'configuration:create' ||
      p.id === 'configuration:update' ||
      p.id === 'settings:view';
    return { allowed, scope: 'everything' };
  });

  // 13. Staff (Legacy basic staff blueprint)
  const staffPerms = createPerms((p) => {
    if (p.id === 'client:view') return { allowed: true, scope: 'everything' };
    if (p.id === 'task:view' || p.id === 'task:edit') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'document:view' || p.id === 'document:create') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'attendance:view_self' || p.id === 'attendance:matrix_view_self') return { allowed: true, scope: 'assigned_only' };
    if (p.id === 'configuration:view' || p.id === 'configuration:create') return { allowed: true, scope: 'everything' };
    return { allowed: false, scope: 'assigned_only' };
  });

  return [
    {
      name: 'Super Admin',
      description: 'Organization Owner with unrestricted practice management privileges.',
      isSuperAdmin: true,
      isSystemDefault: true,
      permissions: superAdminPerms
    },
    {
      name: 'Senior Manager',
      description: 'Senior leadership overseeing firm-wide clients, tasks, staff delegation, and billing.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: seniorManagerPerms
    },
    {
      name: 'Manager',
      description: 'Engagement manager directing execution, assignments, and compliance sign-offs.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: managerPerms
    },
    {
      name: 'Senior Associate',
      description: 'Experienced associate conducting in-depth audits, tax returns, and task verification.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: seniorAssociatePerms
    },
    {
      name: 'Associate',
      description: 'Core practice associate executing compliance filings, task checklists, and worksheets.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: associatePerms
    },
    {
      name: 'Qualified Chartered Accountant',
      description: 'Certified CA managing statutory audits, direct & indirect taxation, and sign-offs.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: qualifiedCaPerms
    },
    {
      name: 'Semi-Qualified CA',
      description: 'CA Intermediate/Finalist preparing computations, GST reconciliations, and audit papers.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: semiQualifiedCaPerms
    },
    {
      name: 'Article Assistant',
      description: 'ICAI Trainee executing field audits, voucher checks, and assigned compliance tasks.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: articleAssistantPerms
    },
    {
      name: 'Accountant',
      description: 'Accounting professional managing client billing, tax invoices, outlays, and receipts.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: accountantPerms
    },
    {
      name: 'Office Administrator',
      description: 'Front-office coordinator managing physical documents, DSC tokens, and office presence.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: officeAdminPerms
    },
    {
      name: 'HR Executive',
      description: 'Human resources specialist managing staff onboarding, attendance desk, and payroll.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: hrExecutivePerms
    },
    {
      name: 'Admin',
      description: 'Firm Administrator with wide managerial and operational authority.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: adminPerms
    },
    {
      name: 'Staff',
      description: 'Standard practice team member executing assigned compliance and advisory tasks.',
      isSuperAdmin: false,
      isSystemDefault: true,
      permissions: staffPerms
    }
  ];
}

