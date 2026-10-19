/**
 * Duplicate invoice detection — pure and testable.
 * Two signals, strongest first:
 *   1. Same vendor + same invoice number (near-certain duplicate)
 *   2. Same amount + same issue date + same vendor (likely re-upload)
 */
export interface InvoiceRow {
  id: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  totalAmount: string;
  issueDate: string | null; // YYYY-MM-DD
  filename: string | null;
}

export interface DuplicateGroup {
  reason: "same_vendor_and_number" | "same_vendor_amount_date";
  invoices: InvoiceRow[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function findDuplicateInvoiceGroups(invoices: InvoiceRow[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const claimed = new Set<string>();

  const byKey = (
    keyOf: (i: InvoiceRow) => string | null,
    reason: DuplicateGroup["reason"]
  ): void => {
    const buckets = new Map<string, InvoiceRow[]>();
    for (const invoice of invoices) {
      if (claimed.has(invoice.id)) continue;
      const key = keyOf(invoice);
      if (!key) continue;
      const list = buckets.get(key) ?? [];
      list.push(invoice);
      buckets.set(key, list);
    }
    for (const bucket of buckets.values()) {
      if (bucket.length < 2) continue;
      for (const invoice of bucket) claimed.add(invoice.id);
      groups.push({ reason, invoices: bucket });
    }
  };

  byKey(
    (i) => (i.vendorName && i.invoiceNumber ? `${norm(i.vendorName)}|${norm(i.invoiceNumber)}` : null),
    "same_vendor_and_number"
  );
  byKey(
    (i) => (i.vendorName && i.issueDate ? `${norm(i.vendorName)}|${i.totalAmount}|${i.issueDate}` : null),
    "same_vendor_amount_date"
  );

  return groups;
}
