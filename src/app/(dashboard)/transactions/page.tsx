"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Repeat, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategorizeTransaction, useRunAutomations, useTransactions } from "@/hooks/use-transactions";
import { useAccounts } from "@/hooks/use-accounts";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

const STATUS_FILTERS = [
  { value: undefined, label: "All" },
  { value: "UNCATEGORIZED", label: "Uncategorized" },
  { value: "CATEGORIZED", label: "Categorized" },
  { value: "MATCHED", label: "Matched" },
  { value: "RECONCILED", label: "Reconciled" },
] as const;

const STATUS_VARIANTS: Record<string, "default" | "primary" | "success" | "warning"> = {
  UNCATEGORIZED: "warning",
  CATEGORIZED: "primary",
  MATCHED: "success",
  RECONCILED: "success",
  EXCLUDED: "default",
};

export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | undefined>();
  const { data, isPending } = useTransactions(page, status);
  const { data: accounts } = useAccounts();
  const categorize = useCategorizeTransaction();
  const runAutomations = useRunAutomations();

  const categoryAccounts = (accounts ?? []).filter(
    (a) => (a.type === "EXPENSE" || a.type === "REVENUE") && a.isActive
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            Bank activity from imported statements — categorize before reconciling.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={runAutomations.isPending}
          onClick={() => runAutomations.mutate()}
        >
          <Wand2 className="h-4 w-4" /> Run automations
        </Button>
      </div>

      <div className="flex items-center gap-1">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.label}
            onClick={() => {
              setStatus(s.value);
              setPage(1);
            }}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              status === s.value
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-surface-raised text-left text-xs text-muted-foreground">
              <th className="w-28 px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Description</th>
              <th className="w-32 px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="w-64 px-3 py-2.5 font-medium">Category</th>
              <th className="w-32 px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isPending ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-3 py-3">
                    <Skeleton className="h-5" />
                  </td>
                </tr>
              ))
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">
                  No transactions{status ? " with this status" : " yet — upload a bank statement"}.
                </td>
              </tr>
            ) : (
              data?.items.map((tx) => (
                <tr key={tx.id} className="transition-colors hover:bg-accent/40">
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{tx.date}</td>
                  <td className="max-w-72 px-3 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{tx.description}</span>
                      {tx.recurrenceKey && (
                        <span title={`Recurring (${tx.recurrenceKey.split("|")[1]})`}>
                          <Repeat className="h-3 w-3 shrink-0 text-primary" />
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{tx.bankAccount}</span>
                  </td>
                  <td
                    className={cn(
                      "amount px-3 py-2.5 text-right",
                      tx.direction === "CREDIT" ? "text-ledger-credit" : "text-ledger-debit"
                    )}
                  >
                    {tx.direction === "CREDIT" ? "+" : "−"}
                    {formatMoney(tx.amount, "CAD", "en-CA")}
                  </td>
                  <td className="px-3 py-2.5">
                    {tx.status === "RECONCILED" ? (
                      <span className="text-xs">{tx.category ?? "—"}</span>
                    ) : (
                      <select
                        value={
                          tx.category
                            ? (categoryAccounts.find((a) => `${a.code} · ${a.name}` === tx.category)?.id ?? "")
                            : ""
                        }
                        onChange={(e) =>
                          categorize.mutate({ transactionId: tx.id, accountId: e.target.value || null })
                        }
                        className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                      >
                        <option value="">Uncategorized</option>
                        {categoryAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={STATUS_VARIANTS[tx.status] ?? "default"}>{tx.status.toLowerCase()}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.page} of {Math.ceil(data.total / data.pageSize)} · {data.total} transactions
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
