"use client";

import Link from "next/link";
import { ArrowRight, FileSearch } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils/money";
import type { DashboardData } from "@/server/services/dashboard.service";

export function PendingDocumentsCard({
  pending,
  currency,
}: {
  pending: DashboardData["pendingDocuments"];
  currency: string;
}) {
  return (
    <Card className="col-span-full lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>Needs review</CardTitle>
          <CardDescription>Extractions waiting for human approval</CardDescription>
        </div>
        <Badge variant={pending.count > 0 ? "warning" : "success"}>
          {pending.count} pending
        </Badge>
      </CardHeader>
      <CardContent>
        {pending.recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Review queue is clear.
          </p>
        ) : (
          <ul className="divide-y">
            {pending.recent.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/documents/${doc.id}`}
                  className="group flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-accent/40"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <FileSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{doc.filename}</span>
                      <span className="text-xs text-muted-foreground">
                        {doc.type ?? "Classifying"} ·{" "}
                        {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {doc.totalAmount && (
                      <span className="amount text-sm">{formatMoney(doc.totalAmount, currency, "en-CA")}</span>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
