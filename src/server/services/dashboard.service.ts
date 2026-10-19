import { prisma } from "@/lib/db/prisma";
import { money, sum, ZERO, type Money } from "@/lib/utils/money";
import Decimal from "decimal.js";

export interface MonthPoint {
  month: string; // "2026-07"
  label: string; // "Jul"
  revenue: string;
  expenses: string;
}

export interface DashboardData {
  summary: {
    revenueMtd: string;
    expensesMtd: string;
    netIncomeMtd: string;
    cashOnHand: string;
    revenueDeltaPct: number | null; // vs previous month, null when no baseline
    expensesDeltaPct: number | null;
    currency: string;
  };
  series: MonthPoint[];
  pendingDocuments: {
    count: number;
    recent: Array<{ id: string; filename: string; type: string | null; totalAmount: string | null; createdAt: string }>;
  };
  jobs: { active: number; failed24h: number };
  bankAccounts: Array<{ id: string; name: string; institution: string | null; currentBalance: string; currency: string }>;
  unreadNotifications: number;
}

/** First day of the month `offset` months from now (UTC). */
export function monthStart(offset = 0, from = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1));
}

/** Percent change; null when the baseline is zero (avoid ∞% noise in the UI). */
export function percentChange(current: Money, previous: Money): number | null {
  if (previous.isZero()) return null;
  return current.minus(previous).div(previous.abs()).times(100).toDecimalPlaces(1).toNumber();
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function getDashboardData(organizationId: string): Promise<DashboardData> {
  const windowStart = monthStart(-5); // current month + 5 back
  const nextMonth = monthStart(1);

  const [org, lines, pendingCount, pendingRecent, activeJobs, failedJobs, bankAccounts, unread] =
    await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { baseCurrency: true },
      }),
      prisma.journalLine.findMany({
        where: {
          journalEntry: {
            organizationId,
            status: "POSTED",
            date: { gte: windowStart, lt: nextMonth },
          },
          account: { type: { in: ["REVENUE", "EXPENSE"] } },
        },
        select: {
          debit: true,
          credit: true,
          account: { select: { type: true } },
          journalEntry: { select: { date: true } },
        },
      }),
      prisma.document.count({ where: { organizationId, status: "NEEDS_REVIEW" } }),
      prisma.document.findMany({
        where: { organizationId, status: "NEEDS_REVIEW" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, filename: true, type: true, totalAmount: true, createdAt: true },
      }),
      prisma.job.count({ where: { organizationId, status: { in: ["QUEUED", "ACTIVE"] } } }),
      prisma.job.count({
        where: {
          organizationId,
          status: "FAILED",
          updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.bankAccount.findMany({
        where: { organizationId, isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, institution: true, currentBalance: true, currency: true },
      }),
      prisma.notification.count({ where: { organizationId, readAt: null } }),
    ]);

  // Aggregate revenue/expense per month. Sign conventions:
  //   revenue increases with credits (credit − debit)
  //   expenses increase with debits (debit − credit)
  const buckets = new Map<string, { revenue: Money; expenses: Money }>();
  for (let i = -5; i <= 0; i++) {
    const d = monthStart(i);
    buckets.set(d.toISOString().slice(0, 7), { revenue: ZERO, expenses: ZERO });
  }
  for (const line of lines) {
    const key = line.journalEntry.date.toISOString().slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const debit = money(line.debit.toString());
    const credit = money(line.credit.toString());
    if (line.account.type === "REVENUE") bucket.revenue = bucket.revenue.plus(credit).minus(debit);
    else bucket.expenses = bucket.expenses.plus(debit).minus(credit);
  }

  const series: MonthPoint[] = [...buckets.entries()].map(([month, v]) => ({
    month,
    label: MONTH_LABELS[Number(month.slice(5, 7)) - 1]!,
    revenue: v.revenue.toFixed(2),
    expenses: v.expenses.toFixed(2),
  }));

  const currentKey = monthStart(0).toISOString().slice(0, 7);
  const prevKey = monthStart(-1).toISOString().slice(0, 7);
  const current = buckets.get(currentKey)!;
  const previous = buckets.get(prevKey)!;

  const cashOnHand = sum(bankAccounts.map((b) => new Decimal(b.currentBalance.toString())));

  return {
    summary: {
      revenueMtd: current.revenue.toFixed(2),
      expensesMtd: current.expenses.toFixed(2),
      netIncomeMtd: current.revenue.minus(current.expenses).toFixed(2),
      cashOnHand: cashOnHand.toFixed(2),
      revenueDeltaPct: percentChange(current.revenue, previous.revenue),
      expensesDeltaPct: percentChange(current.expenses, previous.expenses),
      currency: org.baseCurrency,
    },
    series,
    pendingDocuments: {
      count: pendingCount,
      recent: pendingRecent.map((d) => ({
        id: d.id,
        filename: d.filename,
        type: d.type,
        totalAmount: d.totalAmount?.toFixed(2) ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
    },
    jobs: { active: activeJobs, failed24h: failedJobs },
    bankAccounts: bankAccounts.map((b) => ({
      id: b.id,
      name: b.name,
      institution: b.institution,
      currentBalance: b.currentBalance.toFixed(2),
      currency: b.currency,
    })),
    unreadNotifications: unread,
  };
}
