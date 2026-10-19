import { z } from "zod";
import { ACCEPTED_MIME_TYPES, DOCUMENT_MAX_SIZE_BYTES } from "@/config/constants";

export const uploadFileSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(200)
    .refine((name) => !name.includes("/") && !name.includes("\\"), "Filename cannot contain path separators"),
  mimeType: z.enum(ACCEPTED_MIME_TYPES, {
    errorMap: () => ({ message: "Unsupported file type. Accepted: PDF, PNG, JPEG, WebP, TIFF, CSV, Excel." }),
  }),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(DOCUMENT_MAX_SIZE_BYTES, `Files must be under ${DOCUMENT_MAX_SIZE_BYTES / 1024 / 1024} MB`),
});

export const uploadRequestSchema = z.object({
  files: z.array(uploadFileSchema).min(1).max(20),
});

export type UploadFileInput = z.infer<typeof uploadFileSchema>;

export const listDocumentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z
    .enum(["UPLOADED", "OCR_PROCESSING", "EXTRACTING", "NEEDS_REVIEW", "APPROVED", "POSTED", "REJECTED", "FAILED"])
    .optional(),
  type: z
    .enum(["INVOICE", "RECEIPT", "BILL", "BANK_STATEMENT", "CHECK", "FINANCIAL_STATEMENT", "PURCHASE_ORDER", "OTHER"])
    .optional(),
  q: z.string().trim().max(120).optional(),
});

export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>;
