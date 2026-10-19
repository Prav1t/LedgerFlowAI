import { create } from "zustand";

export type UploadStatus = "queued" | "uploading" | "finalizing" | "done" | "error";

export interface UploadItem {
  id: string; // local id
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
  documentId?: string;
}

interface UploadState {
  items: UploadItem[];
  add: (items: UploadItem[]) => void;
  update: (id: string, patch: Partial<UploadItem>) => void;
  clearFinished: () => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  items: [],
  add: (items) => set((s) => ({ items: [...s.items, ...items] })),
  update: (id, patch) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
  clearFinished: () =>
    set((s) => ({ items: s.items.filter((i) => i.status !== "done" && i.status !== "error") })),
}));
