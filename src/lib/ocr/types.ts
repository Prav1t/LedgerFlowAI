export interface OcrResult {
  /** Full extracted text, normalized to \n line endings. */
  text: string;
  /** Mean layout confidence 0–1, or null when the source is structured data (CSV/Excel). */
  confidence: number | null;
  pageCount: number;
  /** How the text was obtained — recorded for debugging extraction quality. */
  engine: "document-ai" | "csv" | "xlsx";
}

/** Stored text is capped: enough for any statement, small enough for a TEXT column and LLM context. */
export const MAX_OCR_TEXT_CHARS = 500_000;
