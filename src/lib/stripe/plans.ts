import type { PlanTier, SubscriptionStatus } from "@prisma/client";

/**
 * Plan catalog and entitlement logic — pure. Price ids come from env at the
 * call site so these functions stay testable with any mapping.
 */

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  monthlyPriceLabel: string;
  documentsPerMonth: number;
  teamMembers: number | null; // null = unlimited
  features: string[];
}

export const PLAN_CONFIG: Record<PlanTier, PlanConfig> = {
  STARTER: {
    tier: "STARTER",
    name: "Starter",
    monthlyPriceLabel: "$29",
    documentsPerMonth: 50,
    teamMembers: 3,
    features: ["50 documents/month", "3 team members", "AI extraction & review", "Reports"],
  },
  PROFESSIONAL: {
    tier: "PROFESSIONAL",
    name: "Professional",
    monthlyPriceLabel: "$99",
    documentsPerMonth: 500,
    teamMembers: 10,
    features: ["500 documents/month", "10 team members", "AI copilot", "Automations", "Priority processing"],
  },
  FIRM: {
    tier: "FIRM",
    name: "Firm",
    monthlyPriceLabel: "$299",
    documentsPerMonth: 5000,
    teamMembers: null,
    features: ["5,000 documents/month", "Unlimited team members", "All Professional features", "API access"],
  },
};

/** New orgs run a trial with Professional limits before subscribing. */
export const TRIAL_PLAN: PlanTier = "PROFESSIONAL";
export const TRIAL_DAYS = 14;

export function planFromPriceId(priceId: string, priceMap: Record<string, PlanTier>): PlanTier | null {
  return priceMap[priceId] ?? null;
}

export function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "incomplete":
      return "INCOMPLETE";
    default: // canceled, unpaid, incomplete_expired, paused
      return "CANCELED";
  }
}

export interface Entitlements {
  plan: PlanTier;
  status: SubscriptionStatus;
  documentsPerMonth: number;
  teamMembers: number | null;
  /** Uploads and processing allowed? Read access always stays on. */
  canProcess: boolean;
}

/**
 * Effective entitlements. No subscription row = in-app trial with
 * Professional limits. PAST_DUE keeps working (grace); CANCELED/INCOMPLETE
 * keeps read access but stops new processing.
 */
export function entitlementsFor(
  subscription: { plan: PlanTier; status: SubscriptionStatus } | null
): Entitlements {
  if (!subscription) {
    const config = PLAN_CONFIG[TRIAL_PLAN];
    return {
      plan: TRIAL_PLAN,
      status: "TRIALING",
      documentsPerMonth: config.documentsPerMonth,
      teamMembers: config.teamMembers,
      canProcess: true,
    };
  }
  const config = PLAN_CONFIG[subscription.plan];
  return {
    plan: subscription.plan,
    status: subscription.status,
    documentsPerMonth: config.documentsPerMonth,
    teamMembers: config.teamMembers,
    canProcess: subscription.status === "ACTIVE" || subscription.status === "TRIALING" || subscription.status === "PAST_DUE",
  };
}

export function overDocumentLimit(entitlements: Entitlements, usedThisMonth: number, adding: number): boolean {
  return usedThisMonth + adding > entitlements.documentsPerMonth;
}
