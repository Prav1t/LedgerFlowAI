"use client";

import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { CloudUpload, FileWarning, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useUploadDocuments } from "@/hooks/use-documents";
import { useUploadStore } from "@/stores/upload-store";
import { ACCEPTED_MIME_TYPES, DOCUMENT_MAX_SIZE_BYTES } from "@/config/constants";
import { cn } from "@/lib/utils/cn";

const ACCEPT = Object.fromEntries(ACCEPTED_MIME_TYPES.map((m) => [m, []]));

export function UploadDropzone() {
  const upload = useUploadDocuments();
  const items = useUploadStore((s) => s.items);
  const clearFinished = useUploadStore((s) => s.clearFinished);

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      for (const r of rejected) {
        toast.error(`${r.file.name}: ${r.errors[0]?.message ?? "rejected"}`);
      }
      if (accepted.length > 0) upload.mutate(accepted);
    },
    [upload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: DOCUMENT_MAX_SIZE_BYTES,
    maxFiles: 20,
  });

  const active = items.filter((i) => i.status === "uploading" || i.status === "finalizing" || i.status === "queued");
  const finished = items.filter((i) => i.status === "done" || i.status === "error");

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "grid cursor-pointer place-items-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
        )}
      >
        <input {...getInputProps()} />
        <CloudUpload className={cn("mb-3 h-8 w-8", isDragActive ? "text-primary" : "text-muted-foreground")} />
        <p className="text-sm font-medium">
          {isDragActive ? "Drop to upload" : "Drag & drop documents, or click to browse"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Invoices, receipts, bills, bank statements, checks · PDF, images, CSV, Excel · up to 25 MB each
        </p>
      </div>

      <AnimatePresence>
        {items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-lg border"
          >
            <div className="flex items-center justify-between border-b bg-surface-raised px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                {active.length > 0 ? `Uploading ${active.length}…` : "Uploads"}
              </span>
              {finished.length > 0 && active.length === 0 && (
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={clearFinished}>
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="shrink-0">
                    {item.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : item.status === "error" ? (
                      <FileWarning className="h-4 w-4 text-destructive" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm">{item.file.name}</p>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {item.status === "error"
                          ? "Failed"
                          : item.status === "done"
                            ? "Processing queued"
                            : item.status === "finalizing"
                              ? "Finalizing…"
                              : `${item.progress}%`}
                      </span>
                    </div>
                    {(item.status === "uploading" || item.status === "queued") && (
                      <Progress value={item.progress} className="mt-1.5" />
                    )}
                    {item.error && <p className="mt-0.5 text-xs text-destructive">{item.error}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
