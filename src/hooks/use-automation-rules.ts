"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils/fetcher";

export interface AutomationRuleItem {
  id: string;
  type: string;
  name: string;
  conditions: Record<string, unknown>;
  actions: { setCategoryCode?: string };
  priority: number;
  isActive: boolean;
}

export function useAutomationRules() {
  return useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => apiFetch<AutomationRuleItem[]>("/api/v1/automation-rules"),
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      type: "CATEGORIZATION";
      name: string;
      conditions: Record<string, unknown>;
      actions: { setCategoryCode: string };
      priority?: number;
    }) => apiFetch("/api/v1/automation-rules", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success("Rule created");
      void queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; isActive?: boolean }) =>
      apiFetch(`/api/v1/automation-rules/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["automation-rules"] }),
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/automation-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Rule deleted");
      void queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
    },
    onError: (err) => toast.error(err.message),
  });
}
