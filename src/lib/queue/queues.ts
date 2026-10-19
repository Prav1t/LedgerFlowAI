import { Queue, QueueEvents, JobsOptions } from "bullmq";
import { QUEUE_NAMES } from "@/config/constants";
import { createQueueConnection } from "@/lib/redis/client";

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1_000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

const connection = createQueueConnection();

function makeQueue<T = unknown>(name: string) {
  return new Queue<T>(name, { connection, defaultJobOptions });
}

export const documentProcessingQueue = makeQueue(QUEUE_NAMES.DOCUMENT_PROCESSING);
export const ocrQueue = makeQueue(QUEUE_NAMES.OCR);
export const aiExtractionQueue = makeQueue(QUEUE_NAMES.AI_EXTRACTION);
export const journalPostingQueue = makeQueue(QUEUE_NAMES.JOURNAL_POSTING);
export const notificationsQueue = makeQueue(QUEUE_NAMES.NOTIFICATIONS);
export const automationsQueue = makeQueue(QUEUE_NAMES.AUTOMATIONS);
export const webhookDeliveryQueue = makeQueue(QUEUE_NAMES.WEBHOOK_DELIVERY);

export function queueEvents(name: string) {
  return new QueueEvents(name, { connection: createQueueConnection() });
}
