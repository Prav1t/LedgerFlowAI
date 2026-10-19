"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils/fetcher";
import type {
  BalanceSheet,
  CashFlowStatement,
  IncomeStatement,
  TrialBalance,
} from "@/server/accounting-engine/reports";

export function useTrialBalance(asOf: string) {
  return useQuery({
    queryKey: ["report", "trial-balance", asOf],
    queryFn: () => apiFetch<TrialBalance>(`/api/v1/reports/trial-balance?asOf=${asOf}`),
  });
}

export function useIncomeStatement(from: string, to: string) {
  return useQuery({
    queryKey: ["report", "income-statement", from, to],
    queryFn: () => apiFetch<IncomeStatement>(`/api/v1/reports/income-statement?from=${from}&to=${to}`),
  });
}

export function useBalanceSheet(asOf: string) {
  return useQuery({
    queryKey: ["report", "balance-sheet", asOf],
    queryFn: () => apiFetch<BalanceSheet>(`/api/v1/reports/balance-sheet?asOf=${asOf}`),
  });
}

export function useCashFlow(from: string, to: string) {
  return useQuery({
    queryKey: ["report", "cash-flow", from, to],
    queryFn: () => apiFetch<CashFlowStatement>(`/api/v1/reports/cash-flow?from=${from}&to=${to}`),
  });
}
