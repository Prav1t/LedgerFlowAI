/** Domain enums mirrored from the Prisma schema (single source of truth arrives in Phase 3). */

export const DOCUMENT_TYPES = [
  "INVOICE",
  "RECEIPT",
  "BILL",
  "BANK_STATEMENT",
  "CHECK",
  "FINANCIAL_STATEMENT",
  "PURCHASE_ORDER",
  "OTHER",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = [
  "UPLOADED",
  "OCR_PROCESSING",
  "EXTRACTING",
  "NEEDS_REVIEW",
  "APPROVED",
  "POSTED",
  "REJECTED",
  "FAILED",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const MEMBER_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "REVIEWER", "VIEWER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
