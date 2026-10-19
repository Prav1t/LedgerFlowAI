"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useBalanceSheet,
  useCashFlow,
  useIncomeStatement,
  useTrialBalance,
} from "@/hooks/use-reports";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type { ReportLine } from "@/server/accounting-engine/reports";

const TABS = ["Income statement", "Balance sheet", "Cash flow", "Trial balance"] as const;
type Tab = (typeof TABS)[number];

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("Income statement");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const usesRange = tab === "Income statement" || tab === "Cash flow";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Computed from posted journal entries</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                tab === t
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {usesRange ? (
            <>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" />
              <span>to</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" />
            </>
          ) : (
            <>
              <span>As of</span>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-8 w-36" />
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-surface p-5">
        {tab === "Income statement" && <IncomeStatementView from={from} to={to} />}
        {tab === "Balance sheet" && <BalanceSheetView asOf={asOf} />}
        {tab === "Cash flow" && <CashFlowView from={from} to={to} />}
        {tab === "Trial balance" && <TrialBalanceView asOf={asOf} />}
      </div>
    </div>
  );
}

const Amount = ({ value, bold, negativeRed }: { value: string; bold?: boolean; negativeRed?: boolean }) => (
  <span className={cn("amount", bold && "font-semibold", negativeRed && Number(value) < 0 && "text-destructive")}>
    {formatMoney(value, "CAD", "en-CA")}
  </span>
);

function Section({ title, lines, total, totalLabel }: { title: string; lines: ReportLine[]; total: string; totalLabel: string }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-1 divide-y">
        {lines.length === 0 && <p className="py-1.5 text-sm text-muted-foreground">No activity</p>}
        {lines.map((l) => (
          <div key={l.code} className="flex items-center justify-between py-1.5 text-sm">
            <span>
              <span className="font-mono text-xs text-muted-foreground">{l.code}</span> {l.name}
            </span>
            <Amount value={l.amount} negativeRed />
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between border-t pt-1.5 text-sm">
        <span className="font-medium">{totalLabel}</span>
        <Amount value={total} bold negativeRed />
      </div>
    </div>
  );
}

const ReportSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <Skeleton key={i} className="h-6" />
    ))}
  </div>
);

function IncomeStatementView({ from, to }: { from: string; to: string }) {
  const { data, isPending } = useIncomeStatement(from, to);
  if (isPending || !data) return <ReportSkeleton />;
  return (
    <div className="space-y-5">
      <Section title="Revenue" lines={data.revenue} total={data.totalRevenue} totalLabel="Total revenue" />
      {data.costOfSales.length > 0 && (
        <>
          <Section title="Cost of sales" lines={data.costOfSales} total={data.totalCostOfSales} totalLabel="Total cost of sales" />
          <div className="flex items-center justify-between border-t pt-2 text-sm font-medium">
            <span>Gross profit</span>
            <Amount value={data.grossProfit} bold negativeRed />
          </div>
        </>
      )}
      <Section title="Operating expenses" lines={data.operatingExpenses} total={data.totalOperatingExpenses} totalLabel="Total operating expenses" />
      <div className="flex items-center justify-between rounded-md bg-surface-raised px-3 py-2.5 text-sm font-semibold">
        <span>Net income</span>
        <Amount value={data.netIncome} bold negativeRed />
      </div>
    </div>
  );
}

function BalanceSheetView({ asOf }: { asOf: string }) {
  const { data, isPending } = useBalanceSheet(asOf);
  if (isPending || !data) return <ReportSkeleton />;
  return (
    <div className="space-y-5">
      <Section title="Assets" lines={data.assets} total={data.totalAssets} totalLabel="Total assets" />
      <Section title="Liabilities" lines={data.liabilities} total={data.totalLiabilities} totalLabel="Total liabilities" />
      <div>
        <Section title="Equity" lines={data.equity} total={data.totalEquity} totalLabel="Total equity" />
        <div className="flex items-center justify-between py-1.5 text-sm text-muted-foreground">
          <span className="pl-4">incl. current earnings</span>
          <Amount value={data.currentEarnings} negativeRed />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md bg-surface-raised px-3 py-2.5 text-sm">
        <span className="font-medium">Assets = Liabilities + Equity</span>
        <Badge variant={data.balanced ? "success" : "destructive"}>
          {data.balanced ? "balanced" : "out of balance"}
        </Badge>
      </div>
    </div>
  );
}

function CashFlowView({ from, to }: { from: string; to: string }) {
  const { data, isPending } = useCashFlow(from, to);
  if (isPending || !data) return <ReportSkeleton />;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Net income</span>
        <Amount value={data.netIncome} bold negativeRed />
      </div>
      <Section title="Operating adjustments" lines={data.operatingAdjustments} total={data.netOperating} totalLabel="Net cash from operations" />
      <Section title="Investing activities" lines={data.investing} total={data.netInvesting} totalLabel="Net cash from investing" />
      <Section title="Financing activities" lines={data.financing} total={data.netFinancing} totalLabel="Net cash from financing" />
      <div className="space-y-1.5 rounded-md bg-surface-raised px-3 py-2.5 text-sm">
        <div className="flex items-center justify-between font-semibold">
          <span>Net change in cash</span>
          <Amount value={data.netChangeInCash} bold negativeRed />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Cash: {formatMoney(data.openingCash, "CAD", "en-CA")} → {formatMoney(data.closingCash, "CAD", "en-CA")}
          </span>
          <Badge variant={data.reconciled ? "success" : "warning"}>
            {data.reconciled ? "reconciled" : "unreconciled"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function TrialBalanceView({ asOf }: { asOf: string }) {
  const { data, isPending } = useTrialBalance(asOf);
  if (isPending || !data) return <ReportSkeleton />;
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">Account</th>
            <th className="w-32 pb-2 text-right font-medium text-ledger-debit">Debit</th>
            <th className="w-32 pb-2 text-right font-medium text-ledger-credit">Credit</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.rows.map((row) => (
            <tr key={row.code}>
              <td className="py-1.5">
                <span className="font-mono text-xs text-muted-foreground">{row.code}</span> {row.name}
              </td>
              <td className="amount py-1.5 text-right">{Number(row.debit) > 0 ? formatMoney(row.debit, "CAD", "en-CA") : ""}</td>
              <td className="amount py-1.5 text-right">{Number(row.credit) > 0 ? formatMoney(row.credit, "CAD", "en-CA") : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <td className="flex items-center gap-2 py-2">
              Totals
              <Badge variant={data.balanced ? "success" : "destructive"}>
                {data.balanced ? "balanced" : "out of balance"}
              </Badge>
            </td>
            <td className="amount py-2 text-right">{formatMoney(data.totalDebits, "CAD", "en-CA")}</td>
            <td className="amount py-2 text-right">{formatMoney(data.totalCredits, "CAD", "en-CA")}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
