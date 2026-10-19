"use client";

import { useState, Fragment } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useJournalEntries, useReverseEntry, type JournalEntryItem } from "@/hooks/use-journal-entries";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

const STATUS_VARIANTS: Record<string, "default" | "primary" | "success" | "warning" | "destructive"> = {
  DRAFT: "default",
  PENDING_APPROVAL: "warning",
  POSTED: "success",
  REVERSED: "destructive",
};

export default function JournalEntriesPage() {
  const [page, setPage] = useState(1);
  const { data, isPending } = useJournalEntries(page);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Journal entries</h1>
        <p className="text-sm text-muted-foreground">
          The general journal — posted entries are immutable; corrections are reversing entries.
        </p>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <p className="rounded-lg border py-16 text-center text-sm text-muted-foreground">
          No journal entries yet — approve a document or create a manual entry.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-surface-raised text-left text-xs text-muted-foreground">
                <th className="w-8 px-3 py-2.5" />
                <th className="w-16 px-3 py-2.5 font-medium">#</th>
                <th className="w-28 px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Memo</th>
                <th className="w-28 px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="w-28 px-3 py-2.5 font-medium">Status</th>
                <th className="w-12 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.items.map((entry) => <EntryRow key={entry.id} entry={entry} />)}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.page} of {Math.ceil(data.total / data.pageSize)}
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

function EntryRow({ entry }: { entry: JournalEntryItem }) {
  const [expanded, setExpanded] = useState(false);
  const reverse = useReverseEntry();
  const totalDebits = entry.lines.reduce((acc, l) => acc + Number(l.debit), 0);

  return (
    <Fragment>
      <tr className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => setExpanded((e) => !e)}>
        <td className="px-3 py-2.5">
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </td>
        <td className="px-3 py-2.5 font-mono text-xs">{entry.entryNumber}</td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground">{entry.date}</td>
        <td className="max-w-64 truncate px-3 py-2.5">{entry.memo ?? "—"}</td>
        <td className="amount px-3 py-2.5 text-right">{formatMoney(totalDebits, "CAD", "en-CA")}</td>
        <td className="px-3 py-2.5">
          <Badge variant={STATUS_VARIANTS[entry.status] ?? "default"}>{entry.status.toLowerCase()}</Badge>
        </td>
        <td className="px-3 py-2.5">
          {entry.status === "POSTED" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Reverse entry"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Reverse entry #${entry.entryNumber}? A mirror-image entry will be posted.`)) {
                  reverse.mutate(entry.id);
                }
              }}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-raised/60">
          <td colSpan={7} className="px-6 py-3">
            <table className="w-full max-w-xl text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-1.5 font-medium">Account</th>
                  <th className="w-24 pb-1.5 text-right font-medium text-ledger-debit">Debit</th>
                  <th className="w-24 pb-1.5 text-right font-medium text-ledger-credit">Credit</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="py-1">
                      <span className="font-mono text-muted-foreground">{line.accountCode}</span>{" "}
                      {line.accountName}
                    </td>
                    <td className="amount py-1 text-right">
                      {Number(line.debit) > 0 ? formatMoney(line.debit, "CAD", "en-CA") : ""}
                    </td>
                    <td className="amount py-1 text-right">
                      {Number(line.credit) > 0 ? formatMoney(line.credit, "CAD", "en-CA") : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
