import { Worker, type Job as BullJob } from "bullmq";
import { QUEUE_NAMES } from "@/config/constants";
import { createQueueConnection } from "@/lib/redis/client";
import { prisma } from "@/lib/db/prisma";
import { decryptField } from "@/lib/utils/crypto";
import { signWebhookPayload } from "@/server/services/webhook-signing";
import { logger } from "@/lib/utils/logger";
import { onShutdown } from "../index";

interface DeliveryPayload {
  deliveryId: string;
}

const DELIVERY_TIMEOUT_MS = 10_000;

/**
 * Outbound webhook delivery. Signed with the endpoint's secret:
 *   X-LedgerFlow-Timestamp: unix seconds
 *   X-LedgerFlow-Signature: hex(HMAC-SHA256(secret, `${timestamp}.${body}`))
 * 2xx = delivered; anything else throws so BullMQ retries with backoff.
 */
async function deliver(job: BullJob<DeliveryPayload>): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: job.data.deliveryId },
    include: { endpoint: true },
  });
  if (!delivery || delivery.status === "DELIVERED") return;
  if (!delivery.endpoint.isActive) {
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED" } });
    return;
  }

  const body = JSON.stringify(delivery.payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = decryptField(delivery.endpoint.secretEncrypted);
  const signature = signWebhookPayload(secret, timestamp, body);

  let responseStatus: number | null = null;
  try {
    const response = await fetch(delivery.endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LedgerFlow-Event": delivery.event,
        "X-LedgerFlow-Timestamp": timestamp,
        "X-LedgerFlow-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    responseStatus = response.status;
    if (!response.ok) throw new Error(`Endpoint responded ${response.status}`);

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "DELIVERED", responseStatus, deliveredAt: new Date(), attempts: { increment: 1 } },
    });
  } catch (err) {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: finalAttempt ? "FAILED" : "PENDING", responseStatus, attempts: { increment: 1 } },
    });
    throw err; // let BullMQ schedule the retry
  }
}

export function registerWebhookDeliveryWorker(): Worker<DeliveryPayload> {
  const worker = new Worker<DeliveryPayload>(QUEUE_NAMES.WEBHOOK_DELIVERY, deliver, {
    connection: createQueueConnection(),
    concurrency: 5,
  });
  worker.on("failed", (job, err) =>
    logger.warn({ deliveryId: job?.data.deliveryId, err: err.message }, "Webhook delivery attempt failed")
  );
  worker.on("error", (err) => logger.error(err, "Webhook delivery worker error"));
  onShutdown(async () => {
    await worker.close();
  });
  logger.info("Webhook delivery worker registered (queue: %s)", QUEUE_NAMES.WEBHOOK_DELIVERY);
  return worker;
}

registerWebhookDeliveryWorker();
