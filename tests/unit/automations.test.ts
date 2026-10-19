import { describe, it, expect } from "vitest";
import { evaluateRules, matchesConditions } from "@/server/automations/rule-engine";
import { detectRecurringGroups, merchantKey } from "@/server/automations/recurring";
import { matchReceiptsToTransactions } from "@/server/automations/matching";

describe("rule engine", () => {
  const tx = { description: "TELUS MOBILITY MONTHLY", amount: "94.08", direction: "DEBIT" as const };

  it("matches on contains (case-insensitive), direction, and amount bounds", () => {
    expect(matchesConditions({ descriptionContains: "telus" }, tx)).toBe(true);
    expect(matchesConditions({ descriptionContains: "SHELL" }, tx)).toBe(false);
    expect(matchesConditions({ direction: "DEBIT" }, tx)).toBe(true);
    expect(matchesConditions({ direction: "CREDIT" }, tx)).toBe(false);
    expect(matchesConditions({ amountMin: "50", amountMax: "100" }, tx)).toBe(true);
    expect(matchesConditions({ amountMin: "100" }, tx)).toBe(false);
  });

  it("applies the lowest-priority matching rule first", () => {
    const rules = [
      { id: "broad", priority: 200, conditions: { direction: "DEBIT" }, actions: { setCategoryCode: "6999" } },
      { id: "telus", priority: 10, conditions: { descriptionContains: "TELUS" }, actions: { setCategoryCode: "6550" } },
    ];
    expect(evaluateRules(rules, tx)).toEqual({ ruleId: "telus", categoryCode: "6550" });
  });

  it("skips malformed stored rules instead of crashing", () => {
    const rules = [
      { id: "bad", priority: 1, conditions: { nonsense: true }, actions: {} },
      { id: "ok", priority: 2, conditions: { descriptionContains: "TELUS" }, actions: { setCategoryCode: "6550" } },
    ];
    expect(evaluateRules(rules, tx)?.ruleId).toBe("ok");
  });

  it("returns null when nothing matches", () => {
    expect(evaluateRules([], tx)).toBeNull();
  });
});

describe("recurring detection", () => {
  it("normalizes merchant keys by stripping store numbers and dates", () => {
    expect(merchantKey("TELUS MOBILITY #4821 07/08")).toBe("TELUS MOBILITY");
    expect(merchantKey("SHELL CANADA #112")).toBe("SHELL CANADA");
  });

  it("finds a monthly subscription across regular charges", () => {
    const groups = detectRecurringGroups([
      { id: "a", description: "TELUS MOBILITY #1", amount: "94.08", date: "2026-03-08" },
      { id: "b", description: "TELUS MOBILITY #2", amount: "94.08", date: "2026-04-08" },
      { id: "c", description: "TELUS MOBILITY #3", amount: "94.08", date: "2026-05-07" },
      { id: "d", description: "TELUS MOBILITY #4", amount: "95.00", date: "2026-06-08" }, // small variance ok
      { id: "x", description: "STAPLES STORE", amount: "63.27", date: "2026-05-01" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.cadence).toBe("monthly");
    expect(groups[0]!.transactionIds.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("excludes one-off outliers at the same merchant via amount clustering", () => {
    const groups = detectRecurringGroups([
      { id: "a", description: "SHELL CANADA", amount: "80.00", date: "2026-03-05" },
      { id: "b", description: "SHELL CANADA", amount: "82.00", date: "2026-04-04" },
      { id: "c", description: "SHELL CANADA", amount: "81.00", date: "2026-05-05" },
      { id: "big", description: "SHELL CANADA", amount: "600.00", date: "2026-04-20" }, // outlier
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.transactionIds).not.toContain("big");
  });

  it("rejects irregular timing and groups under three charges", () => {
    expect(
      detectRecurringGroups([
        { id: "a", description: "RANDOM SHOP", amount: "50.00", date: "2026-01-01" },
        { id: "b", description: "RANDOM SHOP", amount: "50.00", date: "2026-01-15" },
        { id: "c", description: "RANDOM SHOP", amount: "50.00", date: "2026-04-20" },
      ])
    ).toHaveLength(0);
    expect(
      detectRecurringGroups([
        { id: "a", description: "NETFLIX", amount: "20.00", date: "2026-01-01" },
        { id: "b", description: "NETFLIX", amount: "20.00", date: "2026-02-01" },
      ])
    ).toHaveLength(0);
  });
});

describe("receipt matching", () => {
  it("requires exact amount and picks the closest date", () => {
    const pairs = matchReceiptsToTransactions(
      [{ id: "r1", amount: "189.00", date: "2026-07-05", merchantName: "Shell Canada" }],
      [
        { id: "t-far", amount: "189.00", date: "2026-07-09", description: "SHELL CANADA #4821" },
        { id: "t-near", amount: "189.00", date: "2026-07-05", description: "SHELL CANADA #4821" },
        { id: "t-wrong", amount: "189.01", date: "2026-07-05", description: "SHELL CANADA" },
      ]
    );
    expect(pairs).toEqual([{ receiptId: "r1", transactionId: "t-near", dateDiffDays: 0 }]);
  });

  it("breaks date ties with merchant-token overlap and assigns one-to-one", () => {
    const pairs = matchReceiptsToTransactions(
      [
        { id: "r-shell", amount: "50.00", date: "2026-07-05", merchantName: "Shell Canada" },
        { id: "r-staples", amount: "50.00", date: "2026-07-05", merchantName: "Staples" },
      ],
      [
        { id: "t-staples", amount: "50.00", date: "2026-07-05", description: "STAPLES #112 SURREY" },
        { id: "t-shell", amount: "50.00", date: "2026-07-05", description: "SHELL CANADA #4821" },
      ]
    );
    const byReceipt = Object.fromEntries(pairs.map((p) => [p.receiptId, p.transactionId]));
    expect(byReceipt["r-shell"]).toBe("t-shell");
    expect(byReceipt["r-staples"]).toBe("t-staples");
  });

  it("skips receipts without dates and respects the 5-day window", () => {
    const pairs = matchReceiptsToTransactions(
      [
        { id: "r-nodate", amount: "10.00", date: null, merchantName: "X" },
        { id: "r-old", amount: "10.00", date: "2026-07-01", merchantName: "X" },
      ],
      [{ id: "t", amount: "10.00", date: "2026-07-10", description: "X" }]
    );
    expect(pairs).toHaveLength(0);
  });
});
