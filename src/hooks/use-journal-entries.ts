"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils/fetcher";
import type { Paginated } from "@/types/api";

export interface JournalLineItem {
  id: string;
  accountId: string;
  accountCode: string | null;
  accountName: string | null;
  debit: string;
  credit: string;
  memo: string | null;
}

export interface JournalEntryItem {
  id: string;
  entryNumber: number;
  date: string;
  memo: string | null;
  status: "DRAFT" | "PENDING_APPROVAL" | "POSTED" | "REVERSED";
  sourceType: string;
  postedAt: string | null;
  createdBy: string | null;
  lines: JournalLineItem[];
}

export function useJournalEntries(page: number, status?: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set("status", status);
  return useQuery({
    queryKey: ["journal-entries", page, status],
    queryFn: () => apiFetch<Paginated<JournalEntryItem>>(`/api/v1/journal-entries?${params}`),
    placeholderData: keepPreviousData,
  });
}

export function useReverseEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ entryNumber: number }>(`/api/v1/journal-entries/${id}/reverse`, { method: "POST" }),
    onSuccess: ({ entryNumber }) => {
      toast.success(`Reversal posted as entry #${entryNumber}`);
      void queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toast.error(err.message),
  });
}
