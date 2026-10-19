import { describe, it, expect } from "vitest";
import {
  validateEntry,
  reversalLines,
  normalBalance,
  accountBalance,
  PostingError,
  type EntryLineInput,
} from "@/server/accounting-engine/posting";

const ctx = {
  accounts: new Map([
    ["cash", { isActive: true }],
    ["revenue", { isActive: true }],
    ["gst", { isActive: true }],
    ["dormant", { isActive: false }],
  ]),
};

const line = (accountId: string, debit: string, credit: string): EntryLineInput => ({ accountId, debit, credit });

describe("validateEntry", () => {
  it("accepts a balanced multi-line entry", () => {
    expect(() =>
      validateEntry([line("cash", "5250", "0"), line("revenue", "0", "5000"), line("gst", "0", "250")], ctx)
    ).not.toThrow();
  });

  it("rejects unbalanced entries to the cent", () => {
    expect(() => validateEntry([line("cash", "100.00", "0"), line("revenue", "0", "99.99")], ctx)).toThrowError(
      expect.objectContaining({ code: "UNBALANCED" })
    );
    // sub-cent rounding drift is tolerated
    expect(() => validateEntry([line("cash", "100.001", "0"), line("revenue", "0", "100.00")], ctx)).not.toThrow();
  });

  it("rejects single-line entries", () => {
    expect(() => validateEntry([line("cash", "100", "0")], ctx)).toThrowError(
      expect.objectContaining({ code: "TOO_FEW_LINES" })
    );
  });

  it("rejects negative amounts, both-sided lines, and empty lines", () => {
    expect(() => validateEntry([line("cash", "-5", "0"), line("revenue", "0", "-5")], ctx)).toThrowError(
      expect.objectContaining({ code: "NEGATIVE_AMOUNT" })
    );
    expect(() => validateEntry([line("cash", "5", "5"), line("revenue", "0", "0")], ctx)).toThrowError(
      expect.objectContaining({ code: "BOTH_SIDES" })
    );
    expect(() => validateEntry([line("cash", "5", "0"), line("revenue", "0", "0")], ctx)).toThrowError(
      expect.objectContaining({ code: "EMPTY_LINE" })
    );
  });

  it("rejects unknown and inactive accounts", () => {
    expect(() => validateEntry([line("ghost", "5", "0"), line("revenue", "0", "5")], ctx)).toThrowError(
      expect.objectContaining({ code: "UNKNOWN_ACCOUNT" })
    );
    expect(() => validateEntry([line("dormant", "5", "0"), line("revenue", "0", "5")], ctx)).toThrowError(
      expect.objectContaining({ code: "INACTIVE_ACCOUNT" })
    );
  });

  it("uses PostingError with machine-readable codes", () => {
    try {
      validateEntry([], ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(PostingError);
    }
  });
});

describe("reversalLines", () => {
  it("swaps sides so the reversal balances by construction", () => {
    const original = [
      { accountId: "cash", debit: "5250.0000", credit: "0", memo: "receipt" },
      { accountId: "revenue", debit: "0", credit: "5000.0000" },
      { accountId: "gst", debit: "0", credit: "250.0000" },
    ];
    const reversed = reversalLines(original);
    expect(reversed[0]).toMatchObject({ accountId: "cash", debit: "0.0000", credit: "5250.0000" });
    expect(reversed[1]).toMatchObject({ accountId: "revenue", debit: "5000.0000", credit: "0.0000" });
    expect(() => validateEntry(reversed, ctx)).not.toThrow();
  });
});

describe("balance orientation", () => {
  it("assets/expenses are debit-normal; the rest credit-normal", () => {
    expect(normalBalance("ASSET")).toBe("DEBIT");
    expect(normalBalance("EXPENSE")).toBe("DEBIT");
    expect(normalBalance("LIABILITY")).toBe("CREDIT");
    expect(normalBalance("EQUITY")).toBe("CREDIT");
    expect(normalBalance("REVENUE")).toBe("CREDIT");
  });

  it("orients balances so healthy accounts are positive", () => {
    expect(accountBalance("ASSET", "1000", "250").toFixed(2)).toBe("750.00");
    expect(accountBalance("REVENUE", "0", "5000").toFixed(2)).toBe("5000.00");
    expect(accountBalance("LIABILITY", "100", "600").toFixed(2)).toBe("500.00");
  });
});
