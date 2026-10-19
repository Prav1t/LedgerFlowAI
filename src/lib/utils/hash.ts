import { createHash } from "crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Stable idempotency key for a bank transaction — re-imports can't duplicate. */
export function transactionDedupeHash(parts: {
  bankAccountId: string;
  date: string; // YYYY-MM-DD
  amount: string; // canonical 2dp string
  description: string;
}): string {
  const normalizedDescription = parts.description.trim().toUpperCase().replace(/\s+/g, " ");
  return sha256([parts.bankAccountId, parts.date, parts.amount, normalizedDescription].join("|"));
}
