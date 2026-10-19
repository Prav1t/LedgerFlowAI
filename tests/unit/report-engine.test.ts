import { describe, it, expect } from "vitest";
import {
  buildTrialBalance,
  buildIncomeStatement,
  buildBalanceSheet,
  buildCashFlow,
  cashTreeIds,
  type AccountMeta,
  type LedgerSums,
} from "@/server/accounting-engine/reports";

/**
 * Synthetic ledger for a month of Maple Freight activity:
 *   #1  Dr Chequing 5250 / Cr Revenue 5000, Cr GST payable 250
 *   #2  Dr Fuel 180, Dr GST ITC 9 / Cr Chequing 189
 *   #3  Dr Truck (fixed asset) 10000 / Cr Loan 10000        (investing/financing)
 *   #4  Dr Chequing 2000 / Cr Owner contributions 2000       (financing)
 */
const accounts: AccountMeta[] = [
  { id: "cash-root", code: "1000", name: "Cash and Bank", type: "ASSET", subtype: "current_asset", parentId: null },
  { id: "chequing", code: "1010", name: "Chequing", type: "ASSET", subtype: "current_asset", parentId: "cash-root" },
  { id: "ar", code: "1100", name: "Accounts Receivable", type: "ASSET", subtype: "current_asset", parentId: null },
  { id: "truck", code: "1510", name: "Vehicles", type: "ASSET", subtype: "fixed_asset", parentId: null },
  { id: "ap", code: "2000", name: "Accounts Payable", type: "LIABILITY", subtype: "current_liability", parentId: null },
  { id: "gst-pay", code: "2200", name: "GST Payable", type: "LIABILITY", subtype: "current_liability", parentId: null },
  { id: "gst-itc", code: "2210", name: "GST Recoverable", type: "LIABILITY", subtype: "current_liability", parentId: null },
  { id: "loan", code: "2700", name: "Loans Payable", type: "LIABILITY", subtype: "long_term_liability", parentId: null },
  { id: "contrib", code: "3100", name: "Owner Contributions", type: "EQUITY", subtype: "equity", parentId: null },
  { id: "revenue", code: "4000", name: "Sales Revenue", type: "REVENUE", subtype: "operating_revenue", parentId: null },
  { id: "cogs", code: "5000", name: "COGS", type: "EXPENSE", subtype: "cogs", parentId: null },
  { id: "fuel", code: "6700", name: "Vehicle Expenses", type: "EXPENSE", subtype: "operating_expense", parentId: null },
];

const closing: LedgerSums = new Map([
  ["chequing", { debit: "7250", credit: "189" }], // 5250 + 2000 in, 189 out
  ["truck", { debit: "10000", credit: "0" }],
  ["gst-pay", { debit: "0", credit: "250" }],
  ["gst-itc", { debit: "9", credit: "0" }],
  ["loan", { debit: "0", credit: "10000" }],
  ["contrib", { debit: "0", credit: "2000" }],
  ["revenue", { debit: "0", credit: "5000" }],
  ["fuel", { debit: "180", credit: "0" }],
]);
const opening: LedgerSums = new Map(); // period starts from zero

describe("trial balance", () => {
  it("places balances on their natural side and balances overall", () => {
    const tb = buildTrialBalance(accounts, closing);
    const row = (code: string) => tb.rows.find((r) => r.code === code)!;
    expect(row("1010")).toMatchObject({ debit: "7061.00", credit: "0.00" });
    expect(row("2200")).toMatchObject({ debit: "0.00", credit: "250.00" });
    expect(row("2210")).toMatchObject({ debit: "9.00", credit: "0.00" }); // contra side
    expect(tb.totalDebits).toBe(tb.totalCredits);
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((r) => r.code === "1100")).toBeUndefined(); // zero-activity accounts omitted
  });
});

describe("income statement", () => {
  it("computes revenue, sections, and net income", () => {
    const is = buildIncomeStatement(accounts, closing);
    expect(is.totalRevenue).toBe("5000.00");
    expect(is.totalCostOfSales).toBe("0.00");
    expect(is.grossProfit).toBe("5000.00");
    expect(is.totalOperatingExpenses).toBe("180.00");
    expect(is.netIncome).toBe("4820.00");
    expect(is.operatingExpenses).toEqual([{ code: "6700", name: "Vehicle Expenses", amount: "180.00" }]);
  });
});

describe("balance sheet", () => {
  it("bridges current earnings into equity and balances", () => {
    const bs = buildBalanceSheet(accounts, closing);
    expect(bs.totalAssets).toBe("17061.00"); // 7061 cash + 10000 truck
    expect(bs.totalLiabilities).toBe("10241.00"); // 250 − 9 + 10000
    expect(bs.currentEarnings).toBe("4820.00");
    expect(bs.totalEquity).toBe("6820.00"); // 2000 contributions + 4820 earnings
    expect(bs.balanced).toBe(true); // 17061 = 10241 + 6820
  });
});

describe("cash flow (indirect)", () => {
  it("classifies activity and reconciles to actual Δcash", () => {
    const cashIds = cashTreeIds(accounts);
    expect(cashIds).toEqual(new Set(["cash-root", "chequing"]));

    const cf = buildCashFlow(accounts, opening, closing, cashIds);
    expect(cf.netIncome).toBe("4820.00");
    // Operating: +250 GST payable growth, −9 ITC asset-side growth (as liability contra: −9)
    expect(cf.netOperating).toBe("5061.00"); // 4820 + 250 − 9
    expect(cf.netInvesting).toBe("-10000.00"); // truck purchase
    expect(cf.netFinancing).toBe("12000.00"); // 10000 loan + 2000 contributions
    expect(cf.netChangeInCash).toBe("7061.00");
    expect(cf.openingCash).toBe("0.00");
    expect(cf.closingCash).toBe("7061.00");
    expect(cf.reconciled).toBe(true);
  });

  it("uses opening balances so mid-history periods work", () => {
    // Second month: only a 500 cash sale happens.
    const secondClosing: LedgerSums = new Map(
      [...closing.entries()].map(([k, v]) => [k, { ...v }])
    );
    secondClosing.set("chequing", { debit: "7750", credit: "189" });
    secondClosing.set("revenue", { debit: "0", credit: "5500" });

    const cf = buildCashFlow(accounts, closing, secondClosing, cashTreeIds(accounts));
    expect(cf.netIncome).toBe("500.00");
    expect(cf.netOperating).toBe("500.00");
    expect(cf.netInvesting).toBe("0.00");
    expect(cf.netFinancing).toBe("0.00");
    expect(cf.netChangeInCash).toBe("500.00");
    expect(cf.reconciled).toBe(true);
  });
});
