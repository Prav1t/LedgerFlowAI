import { prisma } from "@/lib/db/prisma";
import {
  buildBalanceSheet,
  buildCashFlow,
  buildIncomeStatement,
  buildTrialBalance,
  cashTreeIds,
  type AccountMeta,
  type LedgerSums,
} from "@/server/accounting-engine/reports";

/** Ledger sums (posted only) per account within an optional date window. */
async function ledgerSums(organizationId: string, opts: { from?: Date; toInclusive?: Date }): Promise<LedgerSums> {
  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      journalEntry: {
        organizationId,
        status: { in: ["POSTED", "REVERSED"] }, // reversed originals stay in history; reversals net them out
        date: {
          ...(opts.from && { gte: opts.from }),
          ...(opts.toInclusive && { lte: opts.toInclusive }),
        },
      },
    },
    _sum: { debit: true, credit: true },
  });
  return new Map(
    grouped.map((g) => [
      g.accountId,
      { debit: g._sum.debit?.toString() ?? "0", credit: g._sum.credit?.toString() ?? "0" },
    ])
  );
}

async function accountMeta(organizationId: string): Promise<AccountMeta[]> {
  return prisma.account.findMany({
    where: { organizationId },
    select: { id: true, code: true, name: true, type: true, subtype: true, parentId: true },
  });
}

const dayBefore = (d: Date) => new Date(d.getTime() - 24 * 60 * 60 * 1000);

export const reportsService = {
  async trialBalance(organizationId: string, asOf: Date) {
    const [accounts, sums] = await Promise.all([
      accountMeta(organizationId),
      ledgerSums(organizationId, { toInclusive: asOf }),
    ]);
    return buildTrialBalance(accounts, sums);
  },

  async incomeStatement(organizationId: string, from: Date, to: Date) {
    const [accounts, sums] = await Promise.all([
      accountMeta(organizationId),
      ledgerSums(organizationId, { from, toInclusive: to }),
    ]);
    return buildIncomeStatement(accounts, sums);
  },

  async balanceSheet(organizationId: string, asOf: Date) {
    const [accounts, sums] = await Promise.all([
      accountMeta(organizationId),
      ledgerSums(organizationId, { toInclusive: asOf }),
    ]);
    return buildBalanceSheet(accounts, sums);
  },

  async cashFlow(organizationId: string, from: Date, to: Date) {
    const [accounts, opening, closing, bankAccounts] = await Promise.all([
      accountMeta(organizationId),
      ledgerSums(organizationId, { toInclusive: dayBefore(from) }),
      ledgerSums(organizationId, { toInclusive: to }),
      prisma.bankAccount.findMany({ where: { organizationId }, select: { accountId: true } }),
    ]);
    // Cash = the 1000 tree plus any ledger account backing a bank account.
    const cashIds = cashTreeIds(accounts);
    for (const b of bankAccounts) cashIds.add(b.accountId);
    return buildCashFlow(accounts, opening, closing, cashIds);
  },
};
