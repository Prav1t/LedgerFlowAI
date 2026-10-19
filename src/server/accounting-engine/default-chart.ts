import type { AccountType } from "@prisma/client";

export interface ChartTemplateAccount {
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  parentCode?: string;
  isSystem?: boolean; // the posting engine and automations depend on these
}

/**
 * Default small-business chart of accounts, provisioned for every new
 * organization. Numbering follows the common convention:
 *   1xxx assets · 2xxx liabilities · 3xxx equity · 4xxx revenue · 5xxx+ expenses
 * System accounts are the fixed targets the AI pipeline posts against
 * (e.g. uncategorized expense, AP, AR, sales tax) and cannot be deactivated.
 */
export const DEFAULT_CHART: ChartTemplateAccount[] = [
  // ── Assets ──────────────────────────────────────────────────────
  { code: "1000", name: "Cash and Bank", type: "ASSET", subtype: "current_asset", isSystem: true },
  { code: "1010", name: "Chequing Account", type: "ASSET", subtype: "current_asset", parentCode: "1000" },
  { code: "1020", name: "Savings Account", type: "ASSET", subtype: "current_asset", parentCode: "1000" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", subtype: "current_asset", isSystem: true },
  { code: "1200", name: "Prepaid Expenses", type: "ASSET", subtype: "current_asset" },
  { code: "1300", name: "Inventory", type: "ASSET", subtype: "current_asset" },
  { code: "1400", name: "Undeposited Funds", type: "ASSET", subtype: "current_asset", isSystem: true },
  { code: "1500", name: "Property and Equipment", type: "ASSET", subtype: "fixed_asset" },
  { code: "1510", name: "Vehicles", type: "ASSET", subtype: "fixed_asset", parentCode: "1500" },
  { code: "1520", name: "Computer Equipment", type: "ASSET", subtype: "fixed_asset", parentCode: "1500" },
  { code: "1590", name: "Accumulated Depreciation", type: "ASSET", subtype: "fixed_asset", parentCode: "1500" },

  // ── Liabilities ─────────────────────────────────────────────────
  { code: "2000", name: "Accounts Payable", type: "LIABILITY", subtype: "current_liability", isSystem: true },
  { code: "2100", name: "Credit Card Payable", type: "LIABILITY", subtype: "current_liability" },
  { code: "2200", name: "Sales Tax Payable (GST/HST)", type: "LIABILITY", subtype: "current_liability", isSystem: true },
  { code: "2210", name: "Sales Tax Recoverable (ITCs)", type: "LIABILITY", subtype: "current_liability", isSystem: true },
  { code: "2300", name: "Payroll Liabilities", type: "LIABILITY", subtype: "current_liability" },
  { code: "2400", name: "Accrued Liabilities", type: "LIABILITY", subtype: "current_liability" },
  { code: "2700", name: "Loans Payable", type: "LIABILITY", subtype: "long_term_liability" },

  // ── Equity ──────────────────────────────────────────────────────
  { code: "3000", name: "Owner's Equity", type: "EQUITY", subtype: "equity" },
  { code: "3100", name: "Owner Contributions", type: "EQUITY", subtype: "equity" },
  { code: "3200", name: "Owner Draws", type: "EQUITY", subtype: "equity" },
  { code: "3900", name: "Retained Earnings", type: "EQUITY", subtype: "equity", isSystem: true },

  // ── Revenue ─────────────────────────────────────────────────────
  { code: "4000", name: "Sales Revenue", type: "REVENUE", subtype: "operating_revenue", isSystem: true },
  { code: "4100", name: "Service Revenue", type: "REVENUE", subtype: "operating_revenue" },
  { code: "4900", name: "Other Income", type: "REVENUE", subtype: "other_revenue" },

  // ── Cost of sales ───────────────────────────────────────────────
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE", subtype: "cogs" },
  { code: "5100", name: "Subcontractors", type: "EXPENSE", subtype: "cogs" },

  // ── Operating expenses ──────────────────────────────────────────
  { code: "6000", name: "Advertising and Marketing", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6050", name: "Bank Fees and Charges", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6100", name: "Insurance", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6150", name: "Interest Expense", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6200", name: "Meals and Entertainment", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6250", name: "Office Supplies", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6300", name: "Professional Fees", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6350", name: "Rent", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6400", name: "Repairs and Maintenance", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6450", name: "Salaries and Wages", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6500", name: "Software and Subscriptions", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6550", name: "Telephone and Internet", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6600", name: "Travel", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6650", name: "Utilities", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6700", name: "Vehicle Expenses", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6800", name: "Depreciation Expense", type: "EXPENSE", subtype: "operating_expense" },
  { code: "6999", name: "Uncategorized Expense", type: "EXPENSE", subtype: "operating_expense", isSystem: true },
];

/** Codes the engine references directly. */
export const SYSTEM_ACCOUNT_CODES = {
  ACCOUNTS_RECEIVABLE: "1100",
  UNDEPOSITED_FUNDS: "1400",
  ACCOUNTS_PAYABLE: "2000",
  SALES_TAX_PAYABLE: "2200",
  SALES_TAX_RECOVERABLE: "2210",
  RETAINED_EARNINGS: "3900",
  SALES_REVENUE: "4000",
  UNCATEGORIZED_EXPENSE: "6999",
} as const;
