import type { ExtractionResult } from "@/lib/ai/schemas";

export interface FieldRow {
  key: string;
  value: string;
  normalizedValue: unknown;
}

function push(rows: FieldRow[], key: string, value: unknown): void {
  if (value === null || value === undefined || value === "") return;
  rows.push({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
    normalizedValue: value,
  });
}

/**
 * Flatten a typed extraction into ExtractedField rows. Scalars become one
 * row each; arrays (line items, transactions) become a single JSON row so
 * the review screen can render them as tables.
 */
export function flattenExtraction(result: ExtractionResult): FieldRow[] {
  const rows: FieldRow[] = [];

  switch (result.kind) {
    case "invoice": {
      const d = result.data;
      push(rows, "vendor_name", d.vendorName);
      push(rows, "invoice_number", d.invoiceNumber);
      push(rows, "purchase_order_number", d.purchaseOrderNumber);
      push(rows, "issue_date", d.issueDate);
      push(rows, "due_date", d.dueDate);
      push(rows, "currency", d.currency);
      push(rows, "subtotal", d.subtotal);
      push(rows, "tax_amount", d.taxAmount);
      push(rows, "total", d.total);
      if (d.lineItems.length > 0) push(rows, "line_items", d.lineItems);
      break;
    }
    case "receipt": {
      const d = result.data;
      push(rows, "merchant_name", d.merchantName);
      push(rows, "date", d.date);
      push(rows, "amount", d.amount);
      push(rows, "tax_amount", d.taxAmount);
      push(rows, "payment_method", d.paymentMethod);
      push(rows, "suggested_category", d.suggestedCategory);
      push(rows, "currency", d.currency);
      break;
    }
    case "bank_statement": {
      const d = result.data;
      push(rows, "institution", d.institution);
      push(rows, "account_number_masked", d.accountNumberMasked);
      push(rows, "period_start", d.periodStart);
      push(rows, "period_end", d.periodEnd);
      push(rows, "opening_balance", d.openingBalance);
      push(rows, "closing_balance", d.closingBalance);
      push(rows, "currency", d.currency);
      push(rows, "transaction_count", d.transactions.length);
      if (d.transactions.length > 0) push(rows, "transactions", d.transactions);
      break;
    }
    case "check": {
      const d = result.data;
      push(rows, "check_number", d.checkNumber);
      push(rows, "payee", d.payee);
      push(rows, "amount", d.amount);
      push(rows, "date", d.date);
      push(rows, "memo", d.memo);
      push(rows, "currency", d.currency);
      break;
    }
    case "generic": {
      const d = result.data;
      push(rows, "summary", d.summary);
      for (const field of d.fields) push(rows, field.key, field.value);
      break;
    }
  }
  return rows;
}

/** The headline amount for the documents list, by type. */
export function primaryAmount(result: ExtractionResult): number | null {
  switch (result.kind) {
    case "invoice":
      return result.data.total;
    case "receipt":
    case "check":
      return result.data.amount;
    case "bank_statement":
      return result.data.closingBalance;
    case "generic":
      return null;
  }
}

/** The headline date for the documents list, by type. */
export function primaryDate(result: ExtractionResult): string | null {
  switch (result.kind) {
    case "invoice":
      return result.data.issueDate;
    case "receipt":
    case "check":
      return result.data.date;
    case "bank_statement":
      return result.data.periodEnd;
    case "generic":
      return null;
  }
}

/** The party name used for vendor matching, by type. */
export function vendorNameOf(result: ExtractionResult): string | null {
  switch (result.kind) {
    case "invoice":
      return result.data.vendorName;
    case "receipt":
      return result.data.merchantName;
    case "check":
      return result.data.payee;
    default:
      return null;
  }
}
