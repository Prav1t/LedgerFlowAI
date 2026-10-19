import { describe, it, expect } from "vitest";
import { monthStart, percentChange } from "@/server/services/dashboard.service";
import { money } from "@/lib/utils/money";

describe("dashboard helpers", () => {
  it("computes month starts in UTC across year boundaries", () => {
    const jan = new Date(Date.UTC(2026, 0, 15));
    expect(monthStart(0, jan).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(monthStart(-1, jan).toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(monthStart(-5, jan).toISOString()).toBe("2025-08-01T00:00:00.000Z");
    expect(monthStart(1, jan).toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("computes percent change with one-decimal precision", () => {
    expect(percentChange(money(120), money(100))).toBe(20);
    expect(percentChange(money(90), money(100))).toBe(-10);
    expect(percentChange(money("105.55"), money(100))).toBe(5.6);
  });

  it("returns null against a zero baseline instead of infinity", () => {
    expect(percentChange(money(500), money(0))).toBeNull();
  });

  it("handles negative baselines using absolute value", () => {
    // previous = -100, current = -50: an improvement of 50%
    expect(percentChange(money(-50), money(-100))).toBe(50);
  });
});
