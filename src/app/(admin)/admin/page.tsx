"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/utils/fetcher";

interface PlatformMetrics {
  organizations: number;
  users: number;
  documents: { total: number; last30d: number; failed30d: number };
  jobs24h: Record<string, number>;
  recentFailedJobs: Array<{ id: string; queue: string; name: string; error: string | null; organization: string; at: string }>;
  revenue: { mrrEstimate: number; activeByPlan: Record<string, number> };
  aiUsage: { copilotReplies30d: number };
}

export default function AdminHomePage() {
  const { data, isPending } = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: () => apiFetch<PlatformMetrics>("/api/v1/admin/metrics"),
    refetchInterval: 30_000,
  });

  if (isPending || !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const stat = (label: string, value: string | number, sub?: string) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="amount text-2xl font-semibold">{value}</div>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Platform admin</h1>

      <div className="grid gap-4 md:grid-cols-4">
        {stat("Organizations", data.organizations)}
        {stat("Users", data.users)}
        {stat("Documents (30d)", data.documents.last30d, `${data.documents.total} all-time · ${data.documents.failed30d} failed`)}
        {stat("MRR estimate", `$${data.revenue.mrrEstimate.toLocaleString()}`, Object.entries(data.revenue.activeByPlan).map(([p, n]) => `${n} ${p}`).join(" · ") || "no active subscriptions")}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Jobs (24h)</CardTitle>
            <CardDescription>Pipeline activity across all tenants</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(data.jobs24h).length === 0 && (
              <p className="text-sm text-muted-foreground">No job activity in the last day.</p>
            )}
            {Object.entries(data.jobs24h).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <Badge variant={status === "FAILED" ? "destructive" : status === "COMPLETED" ? "success" : "primary"}>
                  {status.toLowerCase()}
                </Badge>
                <span className="amount">{count}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-2 text-sm text-muted-foreground">
              <span>Copilot replies (30d)</span>
              <span className="amount">{data.aiUsage.copilotReplies30d}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent failures</CardTitle>
            <CardDescription>Failed jobs, last 24 hours</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentFailedJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failures. 🎉</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.recentFailedJobs.map((job) => (
                  <li key={job.id} className="py-2">
                    <p className="font-medium">
                      {job.queue} · {job.name}
                      <span className="ml-2 text-xs text-muted-foreground">{job.organization}</span>
                    </p>
                    {job.error && <p className="mt-0.5 truncate text-xs text-destructive">{job.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
