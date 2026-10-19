import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { billingService } from "@/server/services/billing.service";
import { env } from "@/config/env";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * Stripe → LedgerFlow subscription sync. Signature-verified; returning
 * non-2xx triggers Stripe's retry. Sync is idempotent, so replays are safe.
 */
export async function POST(req: NextRequest) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await billingService.syncSubscription(event.data.object);
        break;
      case "customer.subscription.deleted":
        await billingService.handleSubscriptionDeleted(event.data.object);
        break;
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe().subscriptions.retrieve(
            typeof session.subscription === "string" ? session.subscription : session.subscription.id
          );
          await billingService.syncSubscription(subscription);
        }
        break;
      }
      default:
        logger.debug({ type: event.type }, "Ignoring unhandled Stripe event");
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error({ err, type: event.type }, "Stripe webhook processing failed — will retry");
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
