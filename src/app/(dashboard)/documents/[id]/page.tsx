"use client";

import { use, useMemo, useState } from "react";
import { Check, X, ShieldAlert, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentStatusBadge } from "@/components/documents/status-badge";
import {
  useApproveDocument,
  useCorrectFields,
  useDocument,
  useRejectDocument,
  type DocumentField,
} from "@/hooks/use-document-review";
import { useAccounts } from "@/hooks/use-accounts";
import { cn } from "@/lib/utils/cn";

/** Fields rendered as JSON tables rather than inputs. */
const TABLE_FIELDS = new Set(["line_items", "transactions"]);

export default function DocumentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: doc, isPending } = useDocument(id);
  const { data: accounts } = useAccounts();
  const correctFields = useCorrectFields(id);
  const approve = useApproveDocument(id);
  const reject = useRejectDocument(id);

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [expenseAccountId, setExpenseAccountId] = useState<string>("");

  const expenseAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.type === "EXPENSE" && a.isActive),
    [accounts]
  );

  if (isPending) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
        <Skeleton className="h-[600px]" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }
  if (!doc) return <p className="py-20 text-center text-muted-foreground">Document not found.</p>;

  const isReviewable = doc.status === "NEEDS_REVIEW";
  const dirty = Object.keys(edits).length > 0;
  const scalarFields = doc.fields.filter((f) => !TABLE_FIELDS.has(f.key));
  const tableFields = doc.fields.filter((f) => TABLE_FIELDS.has(f.key));
  const needsEntry = ["INVOICE", "BILL", "RECEIPT", "CHECK"].includes(doc.type ?? "");

  const saveCorrections = () =>
    correctFields.mutate(
      Object.entries(edits).map(([key, value]) => ({ key, value })),
      { onSuccess: () => setEdits({}) }
    );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{doc.filename}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <DocumentStatusBadge status={doc.status} />
            {doc.type && <Badge variant="outline">{doc.type.toLowerCase().replace(/_/g, " ")}</Badge>}
            {doc.aiConfidence !== null && (
              <span className={cn("flex items-center gap-1 text-xs", doc.aiConfidence < 0.92 && "text-warning")}>
                {doc.aiConfidence < 0.92 && <ShieldAlert className="h-3.5 w-3.5" />}
                {Math.round(doc.aiConfidence * 100)}% extraction confidence
              </span>
            )}
            {doc.vendor && <span className="text-xs">Vendor: {doc.vendor.name}</span>}
            {doc.journalEntry && (
              <Badge variant="success">posted as entry #{doc.journalEntry.entryNumber}</Badge>
            )}
          </div>
        </div>
        {isReviewable && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={reject.isPending}
              onClick={() => {
                const reason = window.prompt("Reason for rejection (optional):") ?? undefined;
                reject.mutate(reason);
              }}
            >
              <X className="h-4 w-4" /> Reject
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={approve.isPending || dirty}
              title={dirty ? "Save corrections first" : undefined}
              onClick={() => approve.mutate(expenseAccountId ? { expenseAccountId } : undefined)}
            >
              <Check className="h-4 w-4" /> {needsEntry ? "Approve & post" : "Approve"}
            </Button>
          </div>
        )}
      </div>

      {doc.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {doc.error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Document preview */}
        <div className="overflow-hidden rounded-lg border bg-surface">
          <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
            <span>
              Preview{doc.pageCount ? ` · ${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}` : ""}
            </span>
            <a href={doc.downloadUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground">
              Open original <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {doc.mimeType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doc.downloadUrl} alt={doc.filename} className="max-h-[70vh] w-full object-contain" />
          ) : doc.mimeType === "application/pdf" ? (
            <iframe src={doc.downloadUrl} title={doc.filename} className="h-[70vh] w-full" />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              Preview unavailable for this file type — open the original above.
            </p>
          )}
        </div>

        {/* Extracted fields */}
        <div className="space-y-4">
          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-surface-raised px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">Extracted fields</span>
              {isReviewable && dirty && (
                <Button size="sm" className="h-6 text-xs" disabled={correctFields.isPending} onClick={saveCorrections}>
                  Save corrections
                </Button>
              )}
            </div>
            <div className="divide-y">
              {scalarFields.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No fields extracted.</p>
              )}
              {scalarFields.map((field) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  editable={isReviewable}
                  value={edits[field.key] ?? field.value}
                  onChange={(v) => setEdits((e) => ({ ...e, [field.key]: v }))}
                />
              ))}
            </div>
          </div>

          {isReviewable && needsEntry && (
            <div className="rounded-lg border p-3">
              <label className="text-xs font-medium text-muted-foreground">
                Expense category for the journal entry
              </label>
              <select
                value={expenseAccountId}
                onChange={(e) => setExpenseAccountId(e.target.value)}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Auto (vendor default → AI suggestion → uncategorized)</option>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {tableFields.map((field) => (
            <JsonTable key={field.id} field={field} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  editable,
  value,
  onChange,
}: {
  field: DocumentField;
  editable: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">{field.key}</span>
      {editable ? (
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 flex-1" />
      ) : (
        <span className="flex-1 truncate text-sm">{field.value}</span>
      )}
      {field.isCorrected ? (
        <Badge variant="primary">corrected</Badge>
      ) : (
        <span className={cn("shrink-0 font-mono text-[11px]", field.confidence < 0.92 ? "text-warning" : "text-muted-foreground")}>
          {Math.round(field.confidence * 100)}%
        </span>
      )}
    </div>
  );
}

function JsonTable({ field }: { field: DocumentField }) {
  const rows = Array.isArray(field.normalizedValue) ? (field.normalizedValue as Record<string, unknown>[]) : [];
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0] ?? {});

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="border-b bg-surface-raised px-3 py-2 text-xs font-medium text-muted-foreground">
        {field.key.replace(/_/g, " ")} ({rows.length})
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {columns.map((c) => (
                <th key={c} className="px-3 py-1.5 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c} className={cn("px-3 py-1.5", typeof row[c] === "number" && "amount text-right")}>
                    {row[c] === null || row[c] === undefined ? "—" : String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
