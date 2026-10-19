"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils/fetcher";
import type { Paginated } from "@/types/api";

export interface TransactionItem {
  id: string;
  date: string;
  description: string;
  amount: string;
  direction: "CREDIT" | "DEBIT";
  status: string;
  recurrenceKey: string | null;
  bankAccount: string;
  category: string | null;
}

export function useTransactions(page: number, status?: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set("status", status);
  return useQuery({
    queryKey: ["transactions", page, status],
    queryFn: () => apiFetch<Paginated<TransactionItem>>(`/api/v1/transactions?${params}`),
    placeholderData: keepPreviousData,
  });
}

export function useCategorizeTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { transactionId: string; accountId: string | null }) =>
      apiFetch("/api/v1/transactions", { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    onError: (err) => toast.error(err.message),
  });
}

export function useRunAutomations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ jobId: string }>("/api/v1/automations/run", { method: "POST" }),
    onSuccess: () => {
      toast.success("Automation sweep queued — categories and matches will update shortly");
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["transactions"] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }, 4000);
    },
    onError: (err) => toast.error(err.message),
  });
}
