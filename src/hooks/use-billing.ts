"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils/fetcher";

export interface BillingSummary {
  plan: "STARTER" | "PROFESSIONAL" | "FIRM";
  status: string;
  documentsPerMonth: number;
  documentsUsedThisMonth: number;
  teamMembers: number | null;
  canProcess: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
}

export function useBillingSummary() {
  return useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => apiFetch<BillingSummary>("/api/v1/billing/summary"),
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: (plan: BillingSummary["plan"]) =>
      apiFetch<{ url: string }>("/api/v1/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan }),
      }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useBillingPortal() {
  return useMutation({
    mutationFn: () => apiFetch<{ url: string }>("/api/v1/billing/portal", { method: "POST" }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => toast.error(err.message),
  });
}
