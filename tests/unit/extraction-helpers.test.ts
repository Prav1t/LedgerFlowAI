import { describe, it, expect } from "vitest";
import { flattenExtraction, primaryAmount, primaryDate, vendorNameOf } from "@/server/services/extraction-helpers";
import { normalizeVendorName } from "@/server/services/vendor.service";
import { transactionDedupeHash } from "@/lib/utils/hash";
import type { ExtractionResult } from "@/lib/ai/schemas";

const invoice: ExtractionResult = {
  kind: "invoice",
  data: {
    vendorName: "Shell Canada Ltd.",
    invoiceNumber: "INV-1042",
    purchaseOrderNumber: null,
    issueDate: "2026-07-03",
    dueDate: "2026-08-02",
    currency: "CAD",
    subtotal: 5000,
    taxAmount: 250,
    total: 5250,
    lineItems: [{ description: "Freight services", quantity: 1, unitPrice: 5000, amount: 5000 }],
    confidence: 0.96,
  },
};

describe("flattenExtraction", () => {
  it("emits one row per present scalar and a JSON row for arrays", () => {
    const rows = flattenExtraction(invoice);
    const keys = rows.map((r) => r.key);
    expect(keys).toContain("vendor_name");
    expect(keys).toContain("total");
    expect(keys).toContain("line_items");
    expect(keys).not.toContain("purchase_order_number"); // null → omitted
    const total = rows.find((r) => r.key === "total")!;
    expect(total.value).toBe("5250");
    expect(total.normalizedValue).toBe(5250);
    const items = rows.find((r) => r.key === "line_items")!;
    expect(Array.isArray(items.normalizedValue)).toBe(true);
  });

  it("keeps statement transactions as one structured row with a count", () => {
    const statement: ExtractionResult = {
      kind: "bank_statement",
      data: {
        institution: "Demo Bank",
        accountNumberMasked: "****4821",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
        openingBalance: 1000,
        closingBalance: 811,
        currency: "CAD",
        transactions: [
          { date: "2026-06-05", description: "SHELL", amount: 189, direction: "DEBIT", runningBalance: 811 },
        ],
        confidence: 0.9,
      },
    };
    const rows = flattenExtraction(statement);
    expect(rows.find((r) => r.key === "transaction_count")!.normalizedValue).toBe(1);
    expect(rows.find((r) => r.key === "transactions")).toBeDefined();
  });
});

describe("primary field selectors", () => {
  it("picks the right headline amount/date/vendor per type", () => {
    expect(primaryAmount(invoice)).toBe(5250);
    expect(primaryDate(invoice)).toBe("2026-07-03");
    expect(vendorNameOf(invoice)).toBe("Shell Canada Ltd.");
    const generic: ExtractionResult = {
      kind: "generic",
      data: { summary: "A financial statement.", fields: [], confidence: 0.8 },
    };
    expect(primaryAmount(generic)).toBeNull();
    expect(vendorNameOf(generic)).toBeNull();
  });
});

describe("normalizeVendorName", () => {
  it("collapses case, whitespace, punctuation, and corporate suffixes", () => {
    expect(normalizeVendorName("Shell Canada Ltd.")).toBe("shell canada");
    expect(normalizeVendorName("SHELL   CANADA")).toBe("shell canada");
    expect(normalizeVendorName("Acme, Inc")).toBe("acme");
    expect(normalizeVendorName("Telus")).toBe("telus");
  });
});

describe("transactionDedupeHash", () => {
  const base = { bankAccountId: "bank_1", date: "2026-06-05", amount: "189.00", description: "SHELL CANADA #4821" };

  it("is stable across description casing and spacing", () => {
    const a = transactionDedupeHash(base);
    const b = transactionDedupeHash({ ...base, description: "  shell   canada #4821 " });
    expect(a).toBe(b);
  });

  it("differs when any component differs", () => {
    expect(transactionDedupeHash(base)).not.toBe(transactionDedupeHash({ ...base, amount: "189.01" }));
    expect(transactionDedupeHash(base)).not.toBe(transactionDedupeHash({ ...base, bankAccountId: "bank_2" }));
  });
});
