import type { MemberRole } from "@prisma/client";

/**
 * Permission catalog — the single vocabulary for authorization checks.
 * Roles map to permission sets here; nothing else in the codebase may
 * compare against role names directly (roles change, capabilities don't).
 */
export const PERMISSIONS = {
  // Documents
  "documents:upload": "Upload documents",
  "documents:view": "View documents",
  "documents:review": "Review and approve extracted data",
  "documents:delete": "Delete documents",
  // Accounting
  "accounting:view": "View ledger, accounts, and reports",
  "accounting:post": "Post journal entries",
  "accounting:manage_accounts": "Create and edit chart of accounts",
  "accounting:close_period": "Run period close and adjusting entries",
  // Organization
  "org:view_members": "View team members",
  "org:manage_members": "Invite, remove, and change member roles",
  "org:manage_settings": "Edit organization settings",
  "org:manage_billing": "Manage subscription and billing",
  // AI
  "copilot:use": "Use the AI copilot",
  "automations:manage": "Configure automation rules",
} as const;

export type Permission = keyof typeof PERMISSIONS;

const VIEWER_PERMISSIONS: Permission[] = ["documents:view", "accounting:view", "org:view_members"];

const REVIEWER_PERMISSIONS: Permission[] = [
  ...VIEWER_PERMISSIONS,
  "documents:upload",
  "documents:review",
  "copilot:use",
];

const ACCOUNTANT_PERMISSIONS: Permission[] = [
  ...REVIEWER_PERMISSIONS,
  "documents:delete",
  "accounting:post",
  "accounting:manage_accounts",
  "accounting:close_period",
  "automations:manage",
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...ACCOUNTANT_PERMISSIONS,
  "org:manage_members",
  "org:manage_settings",
];

const OWNER_PERMISSIONS: Permission[] = [...ADMIN_PERMISSIONS, "org:manage_billing"];

export const ROLE_PERMISSIONS: Record<MemberRole, ReadonlySet<Permission>> = {
  VIEWER: new Set(VIEWER_PERMISSIONS),
  REVIEWER: new Set(REVIEWER_PERMISSIONS),
  ACCOUNTANT: new Set(ACCOUNTANT_PERMISSIONS),
  ADMIN: new Set(ADMIN_PERMISSIONS),
  OWNER: new Set(OWNER_PERMISSIONS),
};

export function hasPermission(role: MemberRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Roles a given role is allowed to assign (nobody grants above their own level). */
const ROLE_RANK: Record<MemberRole, number> = { VIEWER: 0, REVIEWER: 1, ACCOUNTANT: 2, ADMIN: 3, OWNER: 4 };

export function canAssignRole(actor: MemberRole, target: MemberRole): boolean {
  return hasPermissionForRoleChange(actor) && ROLE_RANK[target] < ROLE_RANK[actor];
}

function hasPermissionForRoleChange(role: MemberRole): boolean {
  return hasPermission(role, "org:manage_members");
}
