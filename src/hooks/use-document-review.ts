"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils/fetcher";

export interface DocumentField {
  id: string;
  key: string;
  value: string;
  normalizedValue: unknown;
  confidence: number;
  isCorrected: boolean;
}

export interface DocumentDetail {
  id: string;
  filename: string;
  mimeType: string;
  type: string | null;
  status: string;
  aiConfidence: number | null;
  ocrConfidence: number | null;
  pageCount: number | null;
  totalAmount: string | null;
  currency: string | null;
  error: string | null;
  downloadUrl: string;
  fields: DocumentField[];
  vendor: { id: string; name: string } | null;
  journalEntry: { id: string; entryNumber: number; status: string } | null;
  uploadedBy: { firstName: string | null; lastName: string | null; email: string } | null;
  createdAt: string;
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: ["document", id],
    queryFn: () => apiFetch<DocumentDetail>(`/api/v1/documents/${id}`),
  });
}

function useInvalidateReview(id: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["document", id] });
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
  };
}

export function useCorrectFields(id: string) {
  const invalidate = useInvalidateReview(id);
  return useMutation({
    mutationFn: (corrections: Array<{ key: string; value: string }>) =>
      apiFetch(`/api/v1/documents/${id}/fields`, { method: "PATCH", body: JSON.stringify({ corrections }) }),
    onSuccess: () => {
      toast.success("Corrections saved");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useApproveDocument(id: string) {
  const invalidate = useInvalidateReview(id);
  const router = useRouter();
  return useMutation({
    mutationFn: (options?: { expenseAccountId?: string }) =>
      apiFetch<{ journalEntryId: string | null; entryNumber?: number }>(`/api/v1/documents/${id}/approve`, {
        method: "POST",
        body: JSON.stringify(options ?? {}),
      }),
    onSuccess: (result) => {
      toast.success(
        result.journalEntryId ? `Approved — posted as entry #${result.entryNumber}` : "Approved"
      );
      invalidate();
      router.push("/documents");
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useRejectDocument(id: string) {
  const invalidate = useInvalidateReview(id);
  const router = useRouter();
  return useMutation({
    mutationFn: (reason?: string) =>
      apiFetch(`/api/v1/documents/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      toast.success("Document rejected");
      invalidate();
      router.push("/documents");
    },
    onError: (err) => toast.error(err.message),
  });
}
