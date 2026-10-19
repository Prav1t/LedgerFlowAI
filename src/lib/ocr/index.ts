import { ocrWithDocumentAi } from "./document-ai";
import { parseCsv, parseExcel } from "./spreadsheet";
import type { OcrResult } from "./types";

export type { OcrResult } from "./types";

const EXCEL_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const OCR_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
]);

/** Route a document to the right text-extraction engine by MIME type. */
export async function extractText(buffer: Buffer, mimeType: string): Promise<OcrResult> {
  if (mimeType === "text/csv") return parseCsv(buffer);
  if (EXCEL_MIME_TYPES.has(mimeType)) return parseExcel(buffer);
  if (OCR_MIME_TYPES.has(mimeType)) return ocrWithDocumentAi(buffer, mimeType);
  throw new Error(`No text extraction engine for MIME type: ${mimeType}`);
}
