"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Trash2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentStatusBadge } from "./status-badge";
import { useDocuments, useDeleteDocument, type DocumentFilters } from "@/hooks/use-documents";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

const STATUS_FILTERS = [
  { value: undefined, label: "All" },
  { value: "NEEDS_REVIEW", label: "Needs review" },
  { value: "OCR_PROCESSING", label: "Processing" },
  { value: "POSTED", label: "Posted" },
  { value: "FAILED", label: "Failed" },
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentsTable() {
  const [filters, setFilters] = useState<DocumentFilters>({ page: 1 });
  const [search, setSearch] = useState("");
  const { data, isPending } = useDocuments(filters);
  const deleteDocument = useDeleteDocument();

  const applySearch = () => setFilters((f) => ({ ...f, q: search || undefined, page: 1 }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.label}
              onClick={() => setFilters((f) => ({ ...f, status: s.value, page: 1 }))}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filters.status === s.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search filenames…"
            className="h-9 w-56 pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            onBlur={applySearch}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-surface-raised text-left text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Document</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">Type</th>
              <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Vendor</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Uploaded</th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-3 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                  No documents{filters.q || filters.status ? " match these filters" : " yet — drop some files above"}.
                </td>
              </tr>
            ) : (
              data?.items.map((doc) => (
                <tr key={doc.id} className="transition-colors hover:bg-accent/40">
                  <td className="max-w-64 px-3 py-2.5">
                    <Link href={`/documents/${doc.id}`} className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{doc.filename}</span>
                        <span className="text-xs text-muted-foreground">{formatBytes(doc.sizeBytes)}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">
                    {doc.type ?? "—"}
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs lg:table-cell">{doc.vendorName ?? "—"}</td>
                  <td className="amount px-3 py-2.5 text-right">
                    {doc.totalAmount ? formatMoney(doc.totalAmount, doc.currency ?? "CAD", "en-CA") : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <DocumentStatusBadge status={doc.status} />
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                    {format(new Date(doc.createdAt), "MMM d, h:mm a")}
                  </td>
                  <td className="px-3 py-2.5">
                    {doc.status !== "POSTED" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${doc.filename}`}
                        onClick={() => {
                          if (window.confirm(`Delete "${doc.filename}"? This can't be undone.`)) {
                            deleteDocument.mutate(doc.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
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
            Page {data.page} of {Math.ceil(data.total / data.pageSize)} · {data.total} documents
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.hasMore}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
