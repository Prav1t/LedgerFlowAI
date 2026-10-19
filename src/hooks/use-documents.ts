"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils/fetcher";
import { uploadFileWithProgress } from "@/lib/utils/upload";
import { useUploadStore } from "@/stores/upload-store";
import type { Paginated } from "@/types/api";

export interface DocumentListItem {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  type: string | null;
  status: string;
  totalAmount: string | null;
  currency: string | null;
  documentDate: string | null;
  vendorName: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

export interface DocumentFilters {
  page: number;
  status?: string;
  type?: string;
  q?: string;
}

export function useDocuments(filters: DocumentFilters) {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.q) params.set("q", filters.q);

  return useQuery({
    queryKey: ["documents", filters],
    queryFn: () => apiFetch<Paginated<DocumentListItem>>(`/api/v1/documents?${params}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000, // pipeline statuses move on their own
  });
}

interface UploadSlot {
  documentId: string;
  uploadUrl: string;
}

/**
 * Full upload orchestration per file:
 *   presign → PUT to S3 with progress → confirm → pipeline enqueued.
 * Files proceed independently; one failure never blocks the batch.
 */
export function useUploadDocuments() {
  const queryClient = useQueryClient();
  const { add, update } = useUploadStore();

  return useMutation({
    mutationFn: async (files: File[]) => {
      const items = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        status: "queued" as const,
      }));
      add(items);

      const { uploads } = await apiFetch<{ uploads: UploadSlot[] }>("/api/v1/documents/upload-url", {
        method: "POST",
        body: JSON.stringify({
          files: files.map((f) => ({ filename: f.name, mimeType: f.type, sizeBytes: f.size })),
        }),
      });

      const results = await Promise.allSettled(
        items.map(async (item, i) => {
          const slot = uploads[i];
          if (!slot) throw new Error("Missing upload slot");
          update(item.id, { status: "uploading", documentId: slot.documentId });
          await uploadFileWithProgress(slot.uploadUrl, item.file, (p) =>
            update(item.id, { progress: p })
          );
          update(item.id, { status: "finalizing", progress: 100 });
          await apiFetch(`/api/v1/documents/${slot.documentId}/complete`, { method: "POST" });
          update(item.id, { status: "done" });
        })
      );

      results.forEach((r, i) => {
        if (r.status === "rejected") {
          update(items[i]!.id, {
            status: "error",
            error: r.reason instanceof Error ? r.reason.message : "Upload failed",
          });
        }
      });

      const failed = results.filter((r) => r.status === "rejected").length;
      return { uploaded: results.length - failed, failed };
    },
    onSuccess: ({ uploaded, failed }) => {
      if (uploaded > 0) toast.success(`${uploaded} document${uploaded === 1 ? "" : "s"} uploaded — processing started`);
      if (failed > 0) toast.error(`${failed} upload${failed === 1 ? "" : "s"} failed`);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Document deleted");
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err) => toast.error(err.message),
  });
}
