import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { env } from "@/config/env";
import { authSyncService } from "@/server/services/auth-sync.service";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * Clerk → LedgerFlow identity sync.
 * Signature-verified with svix; returning non-2xx triggers Clerk's retry,
 * which is how out-of-order events (membership before user) self-heal.
 */
export async function POST(req: NextRequest) {
  const secret = env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("CLERK_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: { type: string; data: unknown };
  try {
    event = new Webhook(secret).verify(payload, headers) as { type: string; data: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    await authSyncService.handleEvent(event.type, event.data);
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error({ err, type: event.type }, "Clerk webhook processing failed — will retry");
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
