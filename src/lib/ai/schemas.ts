import { z } from "zod";

/**
 * Extraction contracts. Every AI response is validated against these —
 * a response that doesn't parse is a failed extraction, never free text.
 * Notes for strict structured outputs: no optional keys (nullable instead),
 * no records/maps, closed enums.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD")
  .nullable()
  .describe("ISO 8601 date (YYYY-MM-DD), or null if not present");

const moneyAmount = z.number().describe("Decimal amount, e.g. 1234.56 — no currency symbols");
const confidence = z.number().min(0).max(1).describe("Extraction confidence from 0 to 1");
const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .nullable()
  .describe("ISO 4217 code (CAD, USD…), or null if not shown");

export const DOCUMENT_TYPE_VALUES = [
  "INVOICE",
  "RECEIPT",
  "BILL",
  "BANK_STATEMENT",
  "CHECK",
  "FINANCIAL_STATEMENT",
  "PURCHASE_ORDER",
  "OTHER",
] as const;

export const classificationSchema = z.object({
  type: z.enum(DOCUMENT_TYPE_VALUES),
  confidence,
  reasoning: z.string().max(200).describe("One short sentence explaining the classification"),
});
export type Classification = z.infer<typeof classificationSchema>;

export const invoiceExtractionSchema = z.object({
  vendorName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  purchaseOrderNumber: z.string().nullable(),
  issueDate: isoDate,
  dueDate: isoDate,
  currency: currencyCode,
  subtotal: moneyAmount.nullable(),
  taxAmount: moneyAmount.nullable().describe("Total tax (GST/HST/PST/VAT combined)"),
  total: moneyAmount,
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number().nullable(),
        unitPrice: moneyAmount.nullable(),
        amount: moneyAmount,
      })
    )
    .describe("Empty array if line items are not itemized"),
  confidence,
});
export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

export const receiptExtractionSchema = z.object({
  merchantName: z.string().nullable(),
  date: isoDate,
  amount: moneyAmount.describe("Grand total paid"),
  taxAmount: moneyAmount.nullable(),
  paymentMethod: z.string().nullable().describe('e.g. "visa ending 4821", "cash", "debit"'),
  suggestedCategory: z
    .string()
    .nullable()
    .describe('Best-fit expense category, e.g. "Vehicle Expenses", "Meals and Entertainment"'),
  currency: currencyCode,
  confidence,
});
export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

export const bankStatementExtractionSchema = z.object({
  institution: z.string().nullable(),
  accountNumberMasked: z
    .string()
    .nullable()
    .describe("Only the last 4 digits, formatted like ****1234 — never the full number"),
  periodStart: isoDate,
  periodEnd: isoDate,
  openingBalance: moneyAmount.nullable(),
  closingBalance: moneyAmount.nullable(),
  currency: currencyCode,
  transactions: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: z.string(),
      amount: moneyAmount.describe("Always positive; direction carries the sign"),
      direction: z.enum(["CREDIT", "DEBIT"]).describe("CREDIT = money in, DEBIT = money out"),
      runningBalance: moneyAmount.nullable(),
    })
  ),
  confidence,
});
export type BankStatementExtraction = z.infer<typeof bankStatementExtractionSchema>;

export const checkExtractionSchema = z.object({
  checkNumber: z.string().nullable(),
  payee: z.string().nullable(),
  amount: moneyAmount,
  date: isoDate,
  memo: z.string().nullable(),
  currency: currencyCode,
  confidence,
});
export type CheckExtraction = z.infer<typeof checkExtractionSchema>;

/** Financial statements, POs without invoice structure, and anything else. */
export const genericExtractionSchema = z.object({
  summary: z.string().max(500).describe("2–3 sentence summary of the document"),
  fields: z.array(
    z.object({
      key: z.string().describe("snake_case field name"),
      value: z.string(),
    })
  ),
  confidence,
});
export type GenericExtraction = z.infer<typeof genericExtractionSchema>;

export type ExtractionResult =
  | { kind: "invoice"; data: InvoiceExtraction }
  | { kind: "receipt"; data: ReceiptExtraction }
  | { kind: "bank_statement"; data: BankStatementExtraction }
  | { kind: "check"; data: CheckExtraction }
  | { kind: "generic"; data: GenericExtraction };

/** Which extraction schema serves which classified type. */
export function schemaForType(type: Classification["type"]) {
  switch (type) {
    case "INVOICE":
    case "BILL":
    case "PURCHASE_ORDER":
      return { kind: "invoice" as const, schema: invoiceExtractionSchema, name: "extract_invoice" };
    case "RECEIPT":
      return { kind: "receipt" as const, schema: receiptExtractionSchema, name: "extract_receipt" };
    case "BANK_STATEMENT":
      return {
        kind: "bank_statement" as const,
        schema: bankStatementExtractionSchema,
        name: "extract_bank_statement",
      };
    case "CHECK":
      return { kind: "check" as const, schema: checkExtractionSchema, name: "extract_check" };
    default:
      return { kind: "generic" as const, schema: genericExtractionSchema, name: "extract_document" };
  }
}
