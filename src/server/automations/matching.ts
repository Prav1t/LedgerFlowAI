/**
 * Receipt ↔ bank transaction matching — pure.
 * Hard requirement: exact amount. Ranking: closest date (≤5 days apart),
 * then merchant-token overlap. Greedy one-to-one assignment.
 */

export interface ReceiptForMatching {
  id: string;
  amount: string;
  date: string | null; // YYYY-MM-DD
  merchantName: string | null;
}

export interface TxForMatching {
  id: string;
  amount: string;
  date: string;
  description: string;
}

export interface MatchPair {
  receiptId: string;
  transactionId: string;
  dateDiffDays: number;
}

const MAX_DATE_DIFF = 5;

const tokens = (s: string) =>
  new Set(
    s
      .toUpperCase()
      .replace(/[^A-Z ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3)
  );

function tokenOverlap(a: string | null, b: string): number {
  if (!a) return 0;
  const ta = tokens(a);
  const tb = tokens(b);
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap;
}

const dayDiff = (a: string, b: string) =>
  Math.abs(Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000));

export function matchReceiptsToTransactions(
  receipts: ReceiptForMatching[],
  transactions: TxForMatching[]
): MatchPair[] {
  interface Candidate extends MatchPair {
    overlap: number;
  }
  const candidates: Candidate[] = [];

  for (const receipt of receipts) {
    if (!receipt.date) continue;
    for (const tx of transactions) {
      if (receipt.amount !== tx.amount) continue;
      const diff = dayDiff(receipt.date, tx.date);
      if (diff > MAX_DATE_DIFF) continue;
      candidates.push({
        receiptId: receipt.id,
        transactionId: tx.id,
        dateDiffDays: diff,
        overlap: tokenOverlap(receipt.merchantName, tx.description),
      });
    }
  }

  // Best candidates first: nearest date, then strongest merchant signal.
  candidates.sort((a, b) => a.dateDiffDays - b.dateDiffDays || b.overlap - a.overlap);

  const usedReceipts = new Set<string>();
  const usedTransactions = new Set<string>();
  const pairs: MatchPair[] = [];
  for (const c of candidates) {
    if (usedReceipts.has(c.receiptId) || usedTransactions.has(c.transactionId)) continue;
    usedReceipts.add(c.receiptId);
    usedTransactions.add(c.transactionId);
    pairs.push({ receiptId: c.receiptId, transactionId: c.transactionId, dateDiffDays: c.dateDiffDays });
  }
  return pairs;
}
