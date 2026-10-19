import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { webhookDeliveryQueue } from "@/lib/queue/queues";
import { encryptField } from "@/lib/utils/crypto";
import { logger } from "@/lib/utils/logger";
import type { WebhookEvent } from "./webhook-signing";

export { WEBHOOK_EVENTS, signWebhookPayload, type WebhookEvent } from "./webhook-signing";

export const webhookService = {
  /** Register an endpoint. The signing secret is returned exactly once. */
  async createEndpoint(organizationId: string, url: string, events: WebhookEvent[]) {
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    const endpoint = await prisma.webhookEndpoint.create({
      data: { organizationId, url, events, secretEncrypted: encryptField(secret) },
      select: { id: true, url: true, events: true, isActive: true, createdAt: true },
    });
    return { ...endpoint, secret };
  },

  /**
   * Fan an event out to subscribed endpoints. Fire-and-forget from the
   * caller's perspective: a delivery row + queue job per endpoint, retries
   * handled by BullMQ. Never throws into business flows.
   */
  async dispatch(organizationId: string, event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    try {
      const endpoints = await prisma.webhookEndpoint.findMany({
        where: { organizationId, isActive: true, events: { has: event } },
        select: { id: true },
      });
      for (const endpoint of endpoints) {
        const delivery = await prisma.webhookDelivery.create({
          data: {
            endpointId: endpoint.id,
            event,
            payload: { event, createdAt: new Date().toISOString(), data: payload } as Prisma.InputJsonValue,
          },
        });
        await webhookDeliveryQueue.add("deliver", { deliveryId: delivery.id });
      }
    } catch (err) {
      // Webhooks are best-effort observers — never let them break the pipeline.
      logger.error({ err, event, organizationId }, "Webhook dispatch failed");
    }
  },
};
