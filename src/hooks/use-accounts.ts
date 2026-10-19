"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils/fetcher";

export interface AccountItem {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  subtype: string | null;
  parentId: string | null;
  isActive: boolean;
  isSystem: boolean;
  balance: string;
}

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch<AccountItem[]>("/api/v1/accounts"),
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { code: string; name: string; type: AccountItem["type"] }) =>
      apiFetch<AccountItem>("/api/v1/accounts", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (account) => {
      toast.success(`Account ${account.code} · ${account.name} created`);
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; isActive?: boolean }) =>
      apiFetch<AccountItem>(`/api/v1/accounts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["accounts"] }),
    onError: (err) => toast.error(err.message),
  });
}
