import Decimal from "decimal.js";
import { money, sum, ZERO } from "@/lib/utils/money";
import { accountBalance } from "./posting";
import type { AccountType } from "@prisma/client";

/**
 * Pure report computations. Inputs are account metadata plus ledger sums
 * (total posted debits/credits per account); outputs are fully-formed
 * report structures with string amounts. No I/O — tested exhaustively.
 */

export interface AccountMeta {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  parentId: string | null;
}

export type LedgerSums = Map<string, { debit: string; credit: string }>;

export interface ReportLine {
  code: string;
  name: string;
  amount: string;
}

const fx = (d: Decimal) => d.toFixed(2);

function balanceOf(account: AccountMeta, sums: LedgerSums): Decimal {
  const s = sums.get(account.id);
  if (!s) return ZERO;
  return accountBalance(account.type, s.debit, s.credit);
}

// ── Trial balance ────────────────────────────────────────────────────

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: AccountType;
  debit: string;
  credit: string;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebits: string;
  totalCredits: string;
  balanced: boolean;
}

export function buildTrialBalance(accounts: AccountMeta[], sums: LedgerSums): TrialBalance {
  const rows: TrialBalanceRow[] = [];
  let totalDebits = ZERO;
  let totalCredits = ZERO;

  for (const account of [...accounts].sort((a, b) => a.code.localeCompare(b.code))) {
    const s = sums.get(account.id);
    if (!s) continue;
    const net = money(s.debit).minus(s.credit); // raw debit-minus-credit
    if (net.isZero()) continue;

    const debit = net.greaterThan(ZERO) ? net : ZERO;
    const credit = net.lessThan(ZERO) ? net.abs() : ZERO;
    totalDebits = totalDebits.plus(debit);
    totalCredits = totalCredits.plus(credit);
    rows.push({ code: account.code, name: account.name, type: account.type, debit: fx(debit), credit: fx(credit) });
  }

  return {
    rows,
    totalDebits: fx(totalDebits),
    totalCredits: fx(totalCredits),
    balanced: totalDebits.minus(totalCredits).abs().lessThan(new Decimal("0.005")),
  };
}

// ── Income statement ─────────────────────────────────────────────────

export interface IncomeStatement {
  revenue: ReportLine[];
  totalRevenue: string;
  costOfSales: ReportLine[];
  totalCostOfSales: string;
  grossProfit: string;
  operatingExpenses: ReportLine[];
  totalOperatingExpenses: string;
  netIncome: string;
}

export function buildIncomeStatement(accounts: AccountMeta[], sums: LedgerSums): IncomeStatement {
  const section = (filter: (a: AccountMeta) => boolean): { lines: ReportLine[]; total: Decimal } => {
    const lines: ReportLine[] = [];
    let total = ZERO;
    for (const account of accounts.filter(filter).sort((a, b) => a.code.localeCompare(b.code))) {
      const balance = balanceOf(account, sums);
      if (balance.isZero()) continue;
      lines.push({ code: account.code, name: account.name, amount: fx(balance) });
      total = total.plus(balance);
    }
    return { lines, total };
  };

  const revenue = section((a) => a.type === "REVENUE");
  const cogs = section((a) => a.type === "EXPENSE" && a.subtype === "cogs");
  const opex = section((a) => a.type === "EXPENSE" && a.subtype !== "cogs");

  const grossProfit = revenue.total.minus(cogs.total);
  return {
    revenue: revenue.lines,
    totalRevenue: fx(revenue.total),
    costOfSales: cogs.lines,
    totalCostOfSales: fx(cogs.total),
    grossProfit: fx(grossProfit),
    operatingExpenses: opex.lines,
    totalOperatingExpenses: fx(opex.total),
    netIncome: fx(grossProfit.minus(opex.total)),
  };
}

// ── Balance sheet ────────────────────────────────────────────────────

export interface BalanceSheet {
  assets: ReportLine[];
  totalAssets: string;
  liabilities: ReportLine[];
  totalLiabilities: string;
  equity: ReportLine[];
  currentEarnings: string;
  totalEquity: string;
  balanced: boolean; // assets ≡ liabilities + equity
}

export function buildBalanceSheet(accounts: AccountMeta[], sumsAsOf: LedgerSums): BalanceSheet {
  const collect = (type: AccountType): { lines: ReportLine[]; total: Decimal } => {
    const lines: ReportLine[] = [];
    let total = ZERO;
    for (const account of accounts.filter((a) => a.type === type).sort((a, b) => a.code.localeCompare(b.code))) {
      const balance = balanceOf(account, sumsAsOf);
      if (balance.isZero()) continue;
      lines.push({ code: account.code, name: account.name, amount: fx(balance) });
      total = total.plus(balance);
    }
    return { lines, total };
  };

  const assets = collect("ASSET");
  const liabilities = collect("LIABILITY");
  const equity = collect("EQUITY");

  // No closing entries in-app: cumulative net income to date bridges into
  // equity as "current earnings" so the sheet always balances.
  const revenueTotal = sum(
    accounts.filter((a) => a.type === "REVENUE").map((a) => balanceOf(a, sumsAsOf).toString())
  );
  const expenseTotal = sum(
    accounts.filter((a) => a.type === "EXPENSE").map((a) => balanceOf(a, sumsAsOf).toString())
  );
  const currentEarnings = revenueTotal.minus(expenseTotal);
  const totalEquity = equity.total.plus(currentEarnings);

  return {
    assets: assets.lines,
    totalAssets: fx(assets.total),
    liabilities: liabilities.lines,
    totalLiabilities: fx(liabilities.total),
    equity: equity.lines,
    currentEarnings: fx(currentEarnings),
    totalEquity: fx(totalEquity),
    balanced: assets.total.minus(liabilities.total.plus(totalEquity)).abs().lessThan(new Decimal("0.005")),
  };
}

// ── Cash flow statement (indirect method) ────────────────────────────

export interface CashFlowStatement {
  netIncome: string;
  operatingAdjustments: ReportLine[];
  netOperating: string;
  investing: ReportLine[];
  netInvesting: string;
  financing: ReportLine[];
  netFinancing: string;
  netChangeInCash: string;
  openingCash: string;
  closingCash: string;
  reconciled: boolean; // computed change ≡ actual Δcash
}

/** The cash tree: account 1000 and every descendant. */
export function cashTreeIds(accounts: AccountMeta[], rootCode = "1000"): Set<string> {
  const root = accounts.find((a) => a.code === rootCode);
  if (!root) return new Set();
  const childrenByParent = new Map<string, AccountMeta[]>();
  for (const a of accounts) {
    if (!a.parentId) continue;
    const list = childrenByParent.get(a.parentId) ?? [];
    list.push(a);
    childrenByParent.set(a.parentId, list);
  }
  const ids = new Set<string>();
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    ids.add(node.id);
    stack.push(...(childrenByParent.get(node.id) ?? []));
  }
  return ids;
}

export function buildCashFlow(
  accounts: AccountMeta[],
  sumsOpening: LedgerSums, // strictly before the period
  sumsClosing: LedgerSums, // through the end of the period
  cashAccountIds: Set<string>
): CashFlowStatement {
  const delta = (account: AccountMeta): Decimal =>
    balanceOf(account, sumsClosing).minus(balanceOf(account, sumsOpening));

  // Net income for the period = cumulative NI at close − at open.
  const ni = (sums: LedgerSums) =>
    sum(accounts.filter((a) => a.type === "REVENUE").map((a) => balanceOf(a, sums).toString())).minus(
      sum(accounts.filter((a) => a.type === "EXPENSE").map((a) => balanceOf(a, sums).toString()))
    );
  const netIncome = ni(sumsClosing).minus(ni(sumsOpening));

  const operatingAdjustments: ReportLine[] = [];
  const investing: ReportLine[] = [];
  const financing: ReportLine[] = [];
  let operatingAdj = ZERO;
  let investingTotal = ZERO;
  let financingTotal = ZERO;

  for (const account of [...accounts].sort((a, b) => a.code.localeCompare(b.code))) {
    if (cashAccountIds.has(account.id)) continue;
    if (account.type === "REVENUE" || account.type === "EXPENSE") continue; // inside net income
    const d = delta(account);
    if (d.isZero()) continue;

    if (account.type === "ASSET") {
      if (account.subtype === "fixed_asset") {
        investing.push({ code: account.code, name: account.name, amount: fx(d.neg()) });
        investingTotal = investingTotal.plus(d.neg());
      } else {
        // An increase in a non-cash current asset consumes cash.
        operatingAdjustments.push({ code: account.code, name: account.name, amount: fx(d.neg()) });
        operatingAdj = operatingAdj.plus(d.neg());
      }
    } else if (account.type === "LIABILITY") {
      if (account.subtype === "long_term_liability") {
        financing.push({ code: account.code, name: account.name, amount: fx(d) });
        financingTotal = financingTotal.plus(d);
      } else {
        operatingAdjustments.push({ code: account.code, name: account.name, amount: fx(d) });
        operatingAdj = operatingAdj.plus(d);
      }
    } else {
      // EQUITY: contributions/draws (earnings are already in net income).
      financing.push({ code: account.code, name: account.name, amount: fx(d) });
      financingTotal = financingTotal.plus(d);
    }
  }

  const netOperating = netIncome.plus(operatingAdj);
  const netChange = netOperating.plus(investingTotal).plus(financingTotal);

  const cashBalance = (sums: LedgerSums) =>
    sum(
      accounts
        .filter((a) => cashAccountIds.has(a.id))
        .map((a) => balanceOf(a, sums).toString())
    );
  const openingCash = cashBalance(sumsOpening);
  const closingCash = cashBalance(sumsClosing);

  return {
    netIncome: fx(netIncome),
    operatingAdjustments,
    netOperating: fx(netOperating),
    investing,
    netInvesting: fx(investingTotal),
    financing,
    netFinancing: fx(financingTotal),
    netChangeInCash: fx(netChange),
    openingCash: fx(openingCash),
    closingCash: fx(closingCash),
    reconciled: netChange.minus(closingCash.minus(openingCash)).abs().lessThan(new Decimal("0.005")),
  };
}
