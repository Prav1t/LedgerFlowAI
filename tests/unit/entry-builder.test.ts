import { describe, it, expect } from "vitest";
import { buildDocumentEntryLines } from "@/server/accounting-engine/entry-builder";
import { validateEntry } from "@/server/accounting-engine/posting";

const accounts = {
  expenseAccountId: "exp",
  taxAccountId: "gst",
  creditAccountId: "ap",
};
const ctx = {
  accounts: new Map([
    ["exp", { isActive: true }],
    ["gst", { isActive: true }],
    ["ap", { isActive: true }],
  ]),
};

describe("buildDocumentEntryLines", () => {
  it("splits a payable into net expense + tax ITC + A/P credit", () => {
    const lines = buildDocumentEntryLines({ kind: "PAYABLE", total: "5250.00", taxAmount: "250.00", ...accounts });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ accountId: "exp", debit: "5000.0000" });
    expect(lines[1]).toMatchObject({ accountId: "gst", debit: "250.0000" });
    expect(lines[2]).toMatchObject({ accountId: "ap", credit: "5250.0000" });
    expect(() => validateEntry(lines, ctx)).not.toThrow();
  });

  it("omits the tax line when no tax was itemized", () => {
    const lines = buildDocumentEntryLines({ kind: "SPENT", total: "63.27", taxAmount: null, ...accounts });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountId: "exp", debit: "63.2700" });
    expect(lines[1]).toMatchObject({ accountId: "ap", credit: "63.2700" });
  });

  it("ignores nonsense tax (negative or ≥ total) rather than producing a broken entry", () => {
    const negative = buildDocumentEntryLines({ kind: "SPENT", total: "100", taxAmount: "-5", ...accounts });
    expect(negative).toHaveLength(2);
    const tooBig = buildDocumentEntryLines({ kind: "SPENT", total: "100", taxAmount: "100", ...accounts });
    expect(tooBig).toHaveLength(2);
    expect(tooBig[0]).toMatchObject({ debit: "100.0000" });
  });

  it("rejects non-positive totals", () => {
    expect(() => buildDocumentEntryLines({ kind: "SPENT", total: "0", taxAmount: null, ...accounts })).toThrow();
  });

  it("tags the vendor on expense and payable lines only for payables", () => {
    const payable = buildDocumentEntryLines({ kind: "PAYABLE", total: "100", taxAmount: null, vendorId: "v1", ...accounts });
    expect(payable[0]!.vendorId).toBe("v1");
    expect(payable[1]!.vendorId).toBe("v1");
    const spent = buildDocumentEntryLines({ kind: "SPENT", total: "100", taxAmount: null, vendorId: "v1", ...accounts });
    expect(spent[1]!.vendorId).toBeNull();
  });
});
