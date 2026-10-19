"use client";

import { Cpu, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import type { DashboardData } from "@/server/services/dashboard.service";

export function JobsCard({ jobs }: { jobs: DashboardData["jobs"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI processing</CardTitle>
        <CardDescription>Background pipeline status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm">
            <Cpu className={cn("h-4 w-4", jobs.active > 0 ? "animate-pulse text-primary" : "text-muted-foreground")} />
            Active jobs
          </span>
          <span className="amount text-sm font-medium">{jobs.active}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm">
            <AlertTriangle
              className={cn("h-4 w-4", jobs.failed24h > 0 ? "text-destructive" : "text-muted-foreground")}
            />
            Failed (24h)
          </span>
          <span
            className={cn("amount text-sm font-medium", jobs.failed24h > 0 && "text-destructive")}
          >
            {jobs.failed24h}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
