import Decimal from "decimal.js";
import { money, ZERO } from "@/lib/utils/money";
import type { EntryLineInput } from "./posting";

/**
 * Build the journal entry lines for an approved document. Pure — the
 * approval service resolves account ids, this arranges the debits/credits.
 *
 * Payables (bills/invoices):   Dr expense (net) + Dr tax ITC → Cr A/P
 * Money already spent (receipts/checks): Dr expense (net) + Dr tax ITC → Cr bank
 * Tax splits out only when the document itemized it.
 */
export interface DocumentEntryInput {
  kind: "PAYABLE" | "SPENT";
  total: string; // gross amount
  taxAmount: string | null;
  expenseAccountId: string;
  taxAccountId: string; // GST/HST recoverable (ITCs)
  creditAccountId: string; // A/P for payables; bank/cash for spent
  memo?: string;
  vendorId?: string | null;
}

export function buildDocumentEntryLines(input: DocumentEntryInput): EntryLineInput[] {
  const total = money(input.total);
  if (total.lessThanOrEqualTo(ZERO)) {
    throw new Error("Document total must be positive to generate an entry");
  }

  let tax = input.taxAmount ? money(input.taxAmount) : ZERO;
  // Guard nonsense extractions: tax can never meet/exceed the gross total.
  if (tax.isNegative() || tax.greaterThanOrEqualTo(total)) tax = ZERO;
  const net: Decimal = total.minus(tax);

  const lines: EntryLineInput[] = [
    {
      accountId: input.expenseAccountId,
      debit: net.toFixed(4),
      credit: "0",
      memo: input.memo,
      vendorId: input.vendorId ?? null,
    },
  ];
  if (tax.greaterThan(ZERO)) {
    lines.push({
      accountId: input.taxAccountId,
      debit: tax.toFixed(4),
      credit: "0",
      memo: "Sales tax (ITC)",
    });
  }
  lines.push({
    accountId: input.creditAccountId,
    debit: "0",
    credit: total.toFixed(4),
    memo: input.memo,
    vendorId: input.kind === "PAYABLE" ? (input.vendorId ?? null) : null,
  });
  return lines;
}
