import { describe, it, expect } from "vitest";
import { findDuplicateInvoiceGroups, type InvoiceRow } from "@/server/services/copilot/duplicates";
import { toolDefinitions } from "@/server/services/copilot/tools";

const invoice = (overrides: Partial<InvoiceRow> & { id: string }): InvoiceRow => ({
  vendorName: "Shell Canada",
  invoiceNumber: null,
  totalAmount: "100.00",
  issueDate: null,
  filename: null,
  ...overrides,
});

describe("findDuplicateInvoiceGroups", () => {
  it("flags same vendor + same invoice number regardless of case/spacing", () => {
    const groups = findDuplicateInvoiceGroups([
      invoice({ id: "a", invoiceNumber: "INV-1042" }),
      invoice({ id: "b", vendorName: "SHELL  CANADA", invoiceNumber: "inv-1042" }),
      invoice({ id: "c", invoiceNumber: "INV-9999" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("same_vendor_and_number");
    expect(groups[0]!.invoices.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("falls back to vendor + amount + date when numbers are missing", () => {
    const groups = findDuplicateInvoiceGroups([
      invoice({ id: "a", totalAmount: "189.00", issueDate: "2026-07-05" }),
      invoice({ id: "b", totalAmount: "189.00", issueDate: "2026-07-05" }),
      invoice({ id: "c", totalAmount: "189.00", issueDate: "2026-07-06" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("same_vendor_amount_date");
    expect(groups[0]!.invoices).toHaveLength(2);
  });

  it("does not double-report invoices already claimed by a stronger signal", () => {
    const groups = findDuplicateInvoiceGroups([
      invoice({ id: "a", invoiceNumber: "INV-1", totalAmount: "50.00", issueDate: "2026-07-01" }),
      invoice({ id: "b", invoiceNumber: "INV-1", totalAmount: "50.00", issueDate: "2026-07-01" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("same_vendor_and_number");
  });

  it("ignores invoices lacking the fields a signal needs", () => {
    const groups = findDuplicateInvoiceGroups([
      invoice({ id: "a", vendorName: null, invoiceNumber: "X" }),
      invoice({ id: "b", vendorName: null, invoiceNumber: "X" }),
    ]);
    expect(groups).toHaveLength(0); // no vendor → neither signal applies
  });
});

describe("tool registry", () => {
  it("has unique names and valid JSON Schema shells", () => {
    const names = toolDefinitions.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of toolDefinitions) {
      expect(tool.description!.length).toBeGreaterThan(20);
      expect(tool.input_schema.type).toBe("object");
      expect(Array.isArray((tool.input_schema as { required?: unknown }).required)).toBe(true);
    }
  });

  it("keeps ledger posting out of the copilot's hands", () => {
    const names = toolDefinitions.map((t) => t.name);
    expect(names).toContain("categorize_transaction"); // staging write allowed
    expect(names.join(" ")).not.toMatch(/post|journal_create|approve/); // posting is human-only
  });
});
