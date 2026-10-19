import { describe, it, expect } from "vitest";
import { money, sum, isBalanced, formatMoney, ZERO } from "@/lib/utils/money";

describe("money utilities", () => {
  it("avoids floating point drift", () => {
    // 0.1 + 0.2 !== 0.3 in IEEE 754 — must be exact here.
    expect(money("0.1").plus("0.2").equals("0.3")).toBe(true);
  });

  it("sums a mixed list of values exactly", () => {
    expect(sum(["10.10", "20.20", "0.03"]).toFixed(2)).toBe("30.33");
  });

  it("treats an empty sum as zero", () => {
    expect(sum([]).equals(ZERO)).toBe(true);
  });

  it("validates balanced double-entry sets", () => {
    expect(isBalanced(["100.00", "50.00"], ["150.00"])).toBe(true);
    expect(isBalanced(["100.00"], ["99.99"])).toBe(false);
  });

  it("formats currency for display", () => {
    expect(formatMoney("1234.5", "USD")).toBe("$1,234.50");
    expect(formatMoney("1234.5", "CAD", "en-CA")).toContain("1,234.50");
  });
});
