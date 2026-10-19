export const APP_NAME = "LedgerFlow AI";

export const QUEUE_NAMES = {
  DOCUMENT_PROCESSING: "document-processing",
  OCR: "ocr",
  AI_EXTRACTION: "ai-extraction",
  JOURNAL_POSTING: "journal-posting",
  NOTIFICATIONS: "notifications",
  AUTOMATIONS: "automations",
  WEBHOOK_DELIVERY: "webhook-delivery",
} as const;

export const DOCUMENT_MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

/** Extraction confidence below this threshold forces human review. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.92;

export const API_VERSION = "v1";
