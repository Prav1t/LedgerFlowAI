import Decimal from "decimal.js";
import { money, sum, ZERO } from "@/lib/utils/money";
import type { AccountType } from "@prisma/client";

/**
 * The pure double-entry core. No I/O, no Prisma — every rule here is
 * enforced before any transaction commits, and unit-testable in isolation.
 */

export interface EntryLineInput {
  accountId: string;
  debit: string; // canonical decimal strings — never floats
  credit: string;
  memo?: string;
  vendorId?: string | null;
}

export interface EntryValidationContext {
  /** accountId → active flag, for referenced accounts. */
  accounts: Map<string, { isActive: boolean }>;
}

export class PostingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNBALANCED"
      | "TOO_FEW_LINES"
      | "NEGATIVE_AMOUNT"
      | "BOTH_SIDES"
      | "EMPTY_LINE"
      | "UNKNOWN_ACCOUNT"
      | "INACTIVE_ACCOUNT"
      | "PERIOD_CLOSED"
      | "NOT_POSTABLE"
      | "ALREADY_REVERSED"
  ) {
    super(message);
    this.name = "PostingError";
  }
}

const CENT = new Decimal("0.005");

/**
 * Validate a candidate entry against every double-entry invariant:
 * ≥2 lines, no negatives, one side per line, no empty lines, all accounts
 * known and active, and debits ≡ credits to the cent.
 */
export function validateEntry(lines: EntryLineInput[], ctx: EntryValidationContext): void {
  if (lines.length < 2) {
    throw new PostingError("A journal entry requires at least two lines", "TOO_FEW_LINES");
  }

  for (const line of lines) {
    const debit = money(line.debit);
    const credit = money(line.credit);

    if (debit.isNegative() || credit.isNegative()) {
      throw new PostingError("Amounts must be non-negative — use the opposite side instead", "NEGATIVE_AMOUNT");
    }
    if (debit.greaterThan(ZERO) && credit.greaterThan(ZERO)) {
      throw new PostingError("A line can't have both a debit and a credit", "BOTH_SIDES");
    }
    if (debit.isZero() && credit.isZero()) {
      throw new PostingError("A line must have a debit or a credit", "EMPTY_LINE");
    }

    const account = ctx.accounts.get(line.accountId);
    if (!account) {
      throw new PostingError(`Unknown account: ${line.accountId}`, "UNKNOWN_ACCOUNT");
    }
    if (!account.isActive) {
      throw new PostingError("Entry references an inactive account", "INACTIVE_ACCOUNT");
    }
  }

  const totalDebits = sum(lines.map((l) => l.debit));
  const totalCredits = sum(lines.map((l) => l.credit));
  if (totalDebits.minus(totalCredits).abs().greaterThanOrEqualTo(CENT)) {
    throw new PostingError(
      `Entry is unbalanced: debits ${totalDebits.toFixed(2)} ≠ credits ${totalCredits.toFixed(2)}`,
      "UNBALANCED"
    );
  }
}

/** Reversal = the same lines with sides swapped. Sum invariants are preserved by construction. */
export function reversalLines(lines: Array<{ accountId: string; debit: Decimal | string; credit: Decimal | string; memo?: string | null; vendorId?: string | null }>): EntryLineInput[] {
  return lines.map((l) => ({
    accountId: l.accountId,
    debit: money(l.credit.toString()).toFixed(4),
    credit: money(l.debit.toString()).toFixed(4),
    memo: l.memo ?? undefined,
    vendorId: l.vendorId ?? null,
  }));
}

/** Which side increases an account of this type (the "normal balance"). */
export function normalBalance(type: AccountType): "DEBIT" | "CREDIT" {
  return type === "ASSET" || type === "EXPENSE" ? "DEBIT" : "CREDIT";
}

/**
 * Signed balance from debit/credit totals, oriented so a healthy account
 * is positive (assets/expenses: debit − credit; the rest: credit − debit).
 */
export function accountBalance(type: AccountType, totalDebit: Decimal.Value, totalCredit: Decimal.Value): Decimal {
  const d = money(totalDebit);
  const c = money(totalCredit);
  return normalBalance(type) === "DEBIT" ? d.minus(c) : c.minus(d);
}
