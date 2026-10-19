import { describe, it, expect } from "vitest";
import { DEFAULT_CHART, SYSTEM_ACCOUNT_CODES } from "@/server/accounting-engine/default-chart";

describe("default chart of accounts", () => {
  it("has globally unique account codes", () => {
    const codes = DEFAULT_CHART.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("follows numbering conventions per account type", () => {
    for (const a of DEFAULT_CHART) {
      const first = a.code[0]!;
      const expected = { "1": "ASSET", "2": "LIABILITY", "3": "EQUITY", "4": "REVENUE" }[first] ?? "EXPENSE";
      expect(a.type, `${a.code} ${a.name}`).toBe(expected);
    }
  });

  it("only references parents that exist and share a type", () => {
    const byCode = new Map(DEFAULT_CHART.map((a) => [a.code, a]));
    for (const a of DEFAULT_CHART) {
      if (!a.parentCode) continue;
      const parent = byCode.get(a.parentCode);
      expect(parent, `${a.code} parent ${a.parentCode}`).toBeDefined();
      expect(parent!.type).toBe(a.type);
    }
  });

  it("marks every engine-required system code as a system account", () => {
    const byCode = new Map(DEFAULT_CHART.map((a) => [a.code, a]));
    for (const code of Object.values(SYSTEM_ACCOUNT_CODES)) {
      const account = byCode.get(code);
      expect(account, `missing system account ${code}`).toBeDefined();
      expect(account!.isSystem, `${code} must be isSystem`).toBe(true);
    }
  });

  it("covers all five account types", () => {
    const types = new Set(DEFAULT_CHART.map((a) => a.type));
    expect(types).toEqual(new Set(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]));
  });
});
