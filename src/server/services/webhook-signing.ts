import { createHmac } from "crypto";

/** Pure signing contract — shared by the delivery worker, docs, and tests. */

export const WEBHOOK_EVENTS = ["document.review_ready", "document.posted", "document.failed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** HMAC-SHA256 over `${timestamp}.${body}`. */
export function signWebhookPayload(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}
