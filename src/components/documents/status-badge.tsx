import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "primary" | "success" | "warning" | "destructive" }> = {
  UPLOADED: { label: "Uploaded", variant: "default" },
  OCR_PROCESSING: { label: "Reading", variant: "primary" },
  EXTRACTING: { label: "Extracting", variant: "primary" },
  NEEDS_REVIEW: { label: "Needs review", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  POSTED: { label: "Posted", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  FAILED: { label: "Failed", variant: "destructive" },
};

export function DocumentStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
