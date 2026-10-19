# OCR / Text Extraction

Stage 1 of the document pipeline. Routing by MIME type (`src/lib/ocr/index.ts`):

| Input | Engine | Confidence |
|---|---|---|
| PDF, PNG, JPEG, WebP, TIFF | Google Document AI (Document OCR processor) | mean page layout confidence |
| CSV | papaparse → pipe-delimited rows | n/a (structured source) |
| XLS / XLSX | SheetJS → per-sheet pipe-delimited rows | n/a |

Spreadsheets never touch OCR — they're already text. Output is normalized to
`\n` line endings and capped at 500k chars (`MAX_OCR_TEXT_CHARS`).

## Google Document AI setup (one-time)

1. In Google Cloud Console: create/select a project, enable the
   **Document AI API**.
2. Create a processor: Document AI → Create Processor → **Document OCR**.
   Note its ID and region (`us` or `eu`).
3. Create a service account with role **Document AI API User**, download a
   JSON key, save it as `gcp-credentials.json` in the project root
   (gitignored).
4. Set env:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json
   DOCUMENT_AI_PROJECT_ID=<project-id>
   DOCUMENT_AI_LOCATION=us
   DOCUMENT_AI_PROCESSOR_ID=<processor-id>
   ```
   On Railway (worker), paste the JSON into a `GOOGLE_APPLICATION_CREDENTIALS_JSON`
   variable and write it to disk in a start hook, or use workload identity.

Synchronous processing handles ≤15 pages / 20 MB per request — right-sized
for invoices, receipts, and monthly statements. Longer documents fail with a
clear error surfaced on the document row and a notification.

## Failure semantics

- Transient errors: BullMQ retries (3 attempts, exponential backoff) —
  the document stays in `OCR_PROCESSING` between attempts.
- Final failure: document → `FAILED` with the error message, the mirrored
  Job row → `FAILED`, and a `DOCUMENT_FAILED` notification links to the doc.
- Success: `ocrText`, `ocrConfidence`, `pageCount` stored; an
  `extract-fields` job is enqueued for stage 2 (Phase 7).
