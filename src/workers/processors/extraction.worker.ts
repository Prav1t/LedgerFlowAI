import { Worker, type Job as BullJob } from "bullmq";
import { QUEUE_NAMES } from "@/config/constants";
import { createQueueConnection } from "@/lib/redis/client";
import { runExtraction } from "@/server/services/extraction.service";
import { jobService } from "@/server/services/job.service";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/utils/logger";
import { webhookService } from "@/server/services/webhook.service";
import { onShutdown } from "../index";
import type { DocumentJobPayload } from "./ocr.worker";

/**
 * Pipeline stage 2: AI classification + field extraction.
 *   (ocrText present) → EXTRACTING → NEEDS_REVIEW + notification
 */
async function process(job: BullJob<DocumentJobPayload>): Promise<void> {
  const { documentId, organizationId, jobId } = job.data;
  await jobService.markActive(jobId);
  const result = await runExtraction(documentId, organizationId);
  await jobService.markCompleted(jobId, result);
}

async function handleFailure(job: BullJob<DocumentJobPayload> | undefined, err: Error): Promise<void> {
  if (!job) return;
  const { documentId, organizationId, jobId } = job.data;
  const finalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
  logger.error(
    { documentId, err: err.message, attempt: job.attemptsMade, finalAttempt, stage: "extraction" },
    "Extraction stage failed"
  );
  if (!finalAttempt) return;

  await jobService.markFailed(jobId, err.message).catch(() => {});
  await prisma.document
    .update({ where: { id: documentId }, data: { status: "FAILED", error: err.message.slice(0, 500) } })
    .catch(() => {});
  await prisma.notification
    .create({
      data: {
        organizationId,
        type: "DOCUMENT_FAILED",
        title: "AI extraction failed",
        body: err.message.slice(0, 140),
        href: `/documents/${documentId}`,
      },
    })
    .catch(() => {});
  await webhookService.dispatch(organizationId, "document.failed", { documentId, error: err.message.slice(0, 200) });
}

export function registerExtractionWorker(): Worker<DocumentJobPayload> {
  const worker = new Worker<DocumentJobPayload>(QUEUE_NAMES.AI_EXTRACTION, process, {
    connection: createQueueConnection(),
    concurrency: 2, // two LLM calls per document; keep provider rate limits comfortable
  });

  worker.on("failed", (job, err) => void handleFailure(job, err));
  worker.on("error", (err) => logger.error(err, "Extraction worker error"));

  onShutdown(async () => {
    await worker.close();
  });

  logger.info("Extraction worker registered (queue: %s)", QUEUE_NAMES.AI_EXTRACTION);
  return worker;
}

registerExtractionWorker();
