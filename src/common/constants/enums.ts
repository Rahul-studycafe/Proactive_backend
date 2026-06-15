/**
 * Shared enumerations and constants used across multiple modules.
 */

export const ENTITY_TYPES = [
  'Sole Proprietorship', 'Private Limited', 'Individual',
  'One Person Company', 'Partnership Firm', 'LLP',
  'Trust', 'NGO', 'HUF', 'Public Limited', 'Other'
] as const;

export const TASK_STATUSES = [
  'Pending', 'In Progress', 'Under Review', 'On Hold', 'Completed', 'Cancelled'
] as const;

export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;

export const SCOPES = ['everything', 'assigned_only', 'team_only'] as const;

export const FREQUENCY_TYPES = ['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time'] as const;

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'select', 'date', 'email', 'phone'] as const;
