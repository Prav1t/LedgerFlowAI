import { Worker, type Job as BullJob } from "bullmq";
import { QUEUE_NAMES } from "@/config/constants";
import { createQueueConnection } from "@/lib/redis/client";
import { aiExtractionQueue } from "@/lib/queue/queues";
import { getObjectBuffer } from "@/lib/storage/s3";
import { extractText } from "@/lib/ocr";
import { prisma } from "@/lib/db/prisma";
import { jobService } from "@/server/services/job.service";
import { logger } from "@/lib/utils/logger";
import { webhookService } from "@/server/services/webhook.service";
import { onShutdown } from "../index";

export interface DocumentJobPayload {
  documentId: string;
  organizationId: string;
  jobId: string; // DB Job mirror id
}

/**
 * Pipeline stage 1: text extraction.
 *   UPLOADED → OCR_PROCESSING → (text stored) → enqueue ai-extraction
 * Failures mark the document FAILED with a human-readable error and
 * notify the org. BullMQ retries transient errors (3 attempts, backoff).
 */
async function processDocument(job: BullJob<DocumentJobPayload>): Promise<void> {
  const { documentId, organizationId, jobId } = job.data;
  const log = logger.child({ documentId, jobId, stage: "ocr" });

  await jobService.markActive(jobId);

  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId },
  });
  if (!document) throw new Error(`Document ${documentId} not found for org ${organizationId}`);

  await prisma.document.update({
    where: { id: documentId },
    data: { status: "OCR_PROCESSING", error: null },
  });

  const buffer = await getObjectBuffer(document.storageKey);
  const result = await extractText(buffer, document.mimeType);
  log.info({ engine: result.engine, pages: result.pageCount, chars: result.text.length }, "Text extracted");

  await prisma.document.update({
    where: { id: documentId },
    data: {
      ocrText: result.text,
      ocrConfidence: result.confidence,
      pageCount: result.pageCount,
    },
  });

  // Hand off to stage 2 (AI classification + field extraction, Phase 7).
  const nextJob = await jobService.createStage({
    organizationId,
    documentId,
    queue: QUEUE_NAMES.AI_EXTRACTION,
    name: "extract-fields",
  });
  const bullJob = await aiExtractionQueue.add("extract-fields", {
    documentId,
    organizationId,
    jobId: nextJob.id,
  });
  await prisma.job.update({ where: { id: nextJob.id }, data: { bullJobId: bullJob.id } });

  await jobService.markCompleted(jobId, {
    engine: result.engine,
    pageCount: result.pageCount,
    confidence: result.confidence,
    chars: result.text.length,
  });
}

async function handleFailure(job: BullJob<DocumentJobPayload> | undefined, err: Error): Promise<void> {
  if (!job) return;
  const { documentId, organizationId, jobId } = job.data;
  const finalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
  logger.error({ documentId, err: err.message, attempt: job.attemptsMade, finalAttempt }, "OCR stage failed");

  if (!finalAttempt) return; // BullMQ will retry — don't mark terminal state yet

  await jobService.markFailed(jobId, err.message).catch(() => {});
  await prisma.document
    .update({ where: { id: documentId }, data: { status: "FAILED", error: err.message.slice(0, 500) } })
    .catch(() => {});
  await prisma.notification
    .create({
      data: {
        organizationId,
        type: "DOCUMENT_FAILED",
        title: "Document processing failed",
        body: `We couldn't read this document: ${err.message.slice(0, 140)}`,
        href: `/documents/${documentId}`,
      },
    })
    .catch(() => {});
  await webhookService.dispatch(organizationId, "document.failed", { documentId, error: err.message.slice(0, 200) });
}

export function registerOcrWorker(): Worker<DocumentJobPayload> {
  const worker = new Worker<DocumentJobPayload>(QUEUE_NAMES.DOCUMENT_PROCESSING, processDocument, {
    connection: createQueueConnection(),
    concurrency: 3, // Document AI sync quota-friendly
  });

  worker.on("failed", (job, err) => void handleFailure(job, err));
  worker.on("error", (err) => logger.error(err, "OCR worker error"));

  onShutdown(async () => {
    await worker.close();
  });

  logger.info("OCR worker registered (queue: %s)", QUEUE_NAMES.DOCUMENT_PROCESSING);
  return worker;
}

registerOcrWorker();
