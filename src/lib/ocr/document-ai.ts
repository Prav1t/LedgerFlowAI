import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import { env } from "@/config/env";
import { logger } from "@/lib/utils/logger";
import { MAX_OCR_TEXT_CHARS, type OcrResult } from "./types";

let client: DocumentProcessorServiceClient | null = null;

function getClient(): DocumentProcessorServiceClient {
  // Auth comes from GOOGLE_APPLICATION_CREDENTIALS (standard ADC).
  client ??= new DocumentProcessorServiceClient();
  return client;
}

function processorName(): string {
  const { DOCUMENT_AI_PROJECT_ID, DOCUMENT_AI_LOCATION, DOCUMENT_AI_PROCESSOR_ID } = env;
  if (!DOCUMENT_AI_PROJECT_ID || !DOCUMENT_AI_PROCESSOR_ID) {
    throw new Error(
      "Document AI is not configured — set DOCUMENT_AI_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID (see docs/OCR.md)"
    );
  }
  return `projects/${DOCUMENT_AI_PROJECT_ID}/locations/${DOCUMENT_AI_LOCATION}/processors/${DOCUMENT_AI_PROCESSOR_ID}`;
}

/**
 * OCR a PDF or image with Google Document AI (Document OCR processor).
 * Synchronous processing supports up to 15 pages / 20 MB — within our
 * 25 MB upload cap for typical financial documents; larger files fail
 * with a clear error rather than silently truncating.
 */
export async function ocrWithDocumentAi(buffer: Buffer, mimeType: string): Promise<OcrResult> {
  const [response] = await getClient().processDocument({
    name: processorName(),
    rawDocument: { content: buffer.toString("base64"), mimeType },
  });

  const document = response.document;
  if (!document?.text) {
    throw new Error("Document AI returned no text — the file may be empty or unreadable");
  }

  const pages = document.pages ?? [];
  const confidences = pages
    .map((p) => p.layout?.confidence)
    .filter((c): c is number => typeof c === "number");
  const confidence =
    confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;

  const text = document.text.replace(/\r\n/g, "\n").slice(0, MAX_OCR_TEXT_CHARS);
  logger.debug({ pageCount: pages.length, confidence, chars: text.length }, "Document AI OCR complete");

  return { text, confidence, pageCount: pages.length || 1, engine: "document-ai" };
}
