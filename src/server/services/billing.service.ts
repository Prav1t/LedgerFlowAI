import type Stripe from "stripe";
import type { PlanTier } from "@prisma/client";
import { stripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/config/env";
import {
  entitlementsFor,
  mapStripeStatus,
  planFromPriceId,
  PLAN_CONFIG,
  type Entitlements,
} from "@/lib/stripe/plans";
import { monthStart } from "@/server/services/dashboard.service";
import { logger } from "@/lib/utils/logger";

function priceMap(): Record<string, PlanTier> {
  const map: Record<string, PlanTier> = {};
  if (process.env.STRIPE_PRICE_STARTER) map[process.env.STRIPE_PRICE_STARTER] = "STARTER";
  if (process.env.STRIPE_PRICE_PROFESSIONAL) map[process.env.STRIPE_PRICE_PROFESSIONAL] = "PROFESSIONAL";
  if (process.env.STRIPE_PRICE_FIRM) map[process.env.STRIPE_PRICE_FIRM] = "FIRM";
  return map;
}

function priceIdFor(plan: PlanTier): string {
  const id = {
    STARTER: process.env.STRIPE_PRICE_STARTER,
    PROFESSIONAL: process.env.STRIPE_PRICE_PROFESSIONAL,
    FIRM: process.env.STRIPE_PRICE_FIRM,
  }[plan];
  if (!id) throw new Error(`Stripe price id for ${plan} is not configured (STRIPE_PRICE_${plan})`);
  return id;
}

export const billingService = {
  /** Effective entitlements + current-month usage for gating and the UI. */
  async getEntitlements(organizationId: string): Promise<Entitlements & { documentsUsedThisMonth: number }> {
    const [subscription, used] = await Promise.all([
      prisma.subscription.findUnique({
        where: { organizationId },
        select: { plan: true, status: true },
      }),
      prisma.document.count({
        where: { organizationId, createdAt: { gte: monthStart(0) } },
      }),
    ]);
    return { ...entitlementsFor(subscription), documentsUsedThisMonth: used };
  },

  async getOrCreateCustomer(organizationId: string): Promise<string> {
    const existing = await prisma.subscription.findUnique({ where: { organizationId } });
    if (existing) return existing.stripeCustomerId;

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, slug: true },
    });
    const customer = await stripe().customers.create({
      name: organization.name,
      metadata: { organizationId, slug: organization.slug },
    });
    await prisma.subscription.create({
      data: { organizationId, stripeCustomerId: customer.id, plan: "STARTER", status: "TRIALING" },
    });
    return customer.id;
  },

  async createCheckoutSession(organizationId: string, plan: PlanTier): Promise<string> {
    const customerId = await this.getOrCreateCustomer(organizationId);
    const session = await stripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceIdFor(plan), quantity: 1 }],
      success_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?checkout=success`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?checkout=cancelled`,
      subscription_data: { metadata: { organizationId } },
      allow_promotion_codes: true,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return session.url;
  },

  async createPortalSession(organizationId: string): Promise<string> {
    const customerId = await this.getOrCreateCustomer(organizationId);
    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    });
    return session.url;
  },

  /** Idempotent sync from a Stripe subscription object → our Subscription row. */
  async syncSubscription(subscription: Stripe.Subscription): Promise<void> {
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

    let row = await prisma.subscription.findUnique({ where: { stripeCustomerId: customerId } });
    if (!row) {
      // Recover via metadata (row lost or created out-of-band).
      const organizationId = subscription.metadata?.organizationId;
      if (!organizationId) {
        logger.warn({ customerId }, "Stripe subscription has no matching org — skipping sync");
        return;
      }
      row = await prisma.subscription.create({
        data: { organizationId, stripeCustomerId: customerId, plan: "STARTER", status: "TRIALING" },
      });
    }

    const priceId = subscription.items.data[0]?.price?.id ?? null;
    const plan = priceId ? planFromPriceId(priceId, priceMap()) : null;
    const status = mapStripeStatus(subscription.status);
    const periodEnd = subscription.current_period_end;

    await prisma.subscription.update({
      where: { id: row.id },
      data: {
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        ...(plan && { plan }),
        status,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      },
    });
    logger.info({ organizationId: row.organizationId, plan, status }, "Subscription synced from Stripe");

    if (status === "PAST_DUE") {
      await prisma.notification.create({
        data: {
          organizationId: row.organizationId,
          type: "BILLING",
          title: "Payment failed",
          body: `Your ${plan ? PLAN_CONFIG[plan].name : ""} subscription payment failed — update your payment method to avoid interruption.`,
          href: "/settings/billing",
        },
      });
    }
  },

  async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const row = await prisma.subscription.findUnique({ where: { stripeCustomerId: customerId } });
    if (!row) return;
    await prisma.subscription.update({
      where: { id: row.id },
      data: { status: "CANCELED", stripeSubscriptionId: null, cancelAtPeriodEnd: false },
    });
  },
};
