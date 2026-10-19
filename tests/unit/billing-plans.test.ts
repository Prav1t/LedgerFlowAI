import { describe, it, expect } from "vitest";
import {
  entitlementsFor,
  mapStripeStatus,
  overDocumentLimit,
  planFromPriceId,
  PLAN_CONFIG,
  TRIAL_PLAN,
} from "@/lib/stripe/plans";

describe("plan mapping", () => {
  const priceMap = { price_starter: "STARTER", price_pro: "PROFESSIONAL", price_firm: "FIRM" } as const;

  it("maps price ids to tiers and unknown ids to null", () => {
    expect(planFromPriceId("price_pro", priceMap)).toBe("PROFESSIONAL");
    expect(planFromPriceId("price_unknown", priceMap)).toBeNull();
  });

  it("maps every Stripe status to a defined internal status", () => {
    expect(mapStripeStatus("active")).toBe("ACTIVE");
    expect(mapStripeStatus("trialing")).toBe("TRIALING");
    expect(mapStripeStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeStatus("incomplete")).toBe("INCOMPLETE");
    expect(mapStripeStatus("canceled")).toBe("CANCELED");
    expect(mapStripeStatus("unpaid")).toBe("CANCELED");
    expect(mapStripeStatus("something_new")).toBe("CANCELED"); // safe default
  });
});

describe("entitlements", () => {
  it("gives orgs without a subscription a Professional-limit trial", () => {
    const e = entitlementsFor(null);
    expect(e.plan).toBe(TRIAL_PLAN);
    expect(e.status).toBe("TRIALING");
    expect(e.documentsPerMonth).toBe(PLAN_CONFIG.PROFESSIONAL.documentsPerMonth);
    expect(e.canProcess).toBe(true);
  });

  it("keeps processing on for ACTIVE/TRIALING/PAST_DUE, off for CANCELED/INCOMPLETE", () => {
    expect(entitlementsFor({ plan: "STARTER", status: "ACTIVE" }).canProcess).toBe(true);
    expect(entitlementsFor({ plan: "STARTER", status: "PAST_DUE" }).canProcess).toBe(true); // grace
    expect(entitlementsFor({ plan: "STARTER", status: "CANCELED" }).canProcess).toBe(false);
    expect(entitlementsFor({ plan: "STARTER", status: "INCOMPLETE" }).canProcess).toBe(false);
  });

  it("applies the plan's document and member limits", () => {
    const firm = entitlementsFor({ plan: "FIRM", status: "ACTIVE" });
    expect(firm.documentsPerMonth).toBe(5000);
    expect(firm.teamMembers).toBeNull(); // unlimited
    const starter = entitlementsFor({ plan: "STARTER", status: "ACTIVE" });
    expect(starter.teamMembers).toBe(3);
  });
});

describe("overDocumentLimit", () => {
  const starter = entitlementsFor({ plan: "STARTER", status: "ACTIVE" }); // 50/mo

  it("allows batches exactly at the limit and blocks one past it", () => {
    expect(overDocumentLimit(starter, 45, 5)).toBe(false); // 50 exactly
    expect(overDocumentLimit(starter, 45, 6)).toBe(true); // 51
    expect(overDocumentLimit(starter, 50, 1)).toBe(true);
  });
});
