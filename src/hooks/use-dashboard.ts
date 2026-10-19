"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils/fetcher";
import type { DashboardData } from "@/server/services/dashboard.service";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardData>("/api/v1/dashboard"),
    refetchInterval: 30_000, // jobs/pending counts stay fresh
  });
}
