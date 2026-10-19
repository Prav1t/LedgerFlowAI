/**
 * Recurring transaction detection — pure.
 * A group is recurring when ≥3 charges share a merchant key, cluster on
 * amount, and land at a regular cadence (weekly/biweekly/monthly/quarterly/yearly).
 */

export interface TxForRecurring {
  id: string;
  description: string;
  amount: string;
  date: string; // YYYY-MM-DD
}

export interface RecurringGroup {
  recurrenceKey: string;
  cadence: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  transactionIds: string[];
  typicalAmount: string;
}

/** Strip store numbers, dates, and reference digits: "TELUS MOBILITY #4821 07/08" → "TELUS MOBILITY". */
export function merchantKey(description: string): string {
  return description
    .toUpperCase()
    .replace(/[#*]?\d[\d/\-.]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

const CADENCE_BANDS: Array<{ cadence: RecurringGroup["cadence"]; min: number; max: number }> = [
  { cadence: "weekly", min: 6, max: 8 },
  { cadence: "biweekly", min: 12, max: 16 },
  { cadence: "monthly", min: 26, max: 35 },
  { cadence: "quarterly", min: 85, max: 97 },
  { cadence: "yearly", min: 355, max: 375 },
];

const dayDiff = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function detectRecurringGroups(transactions: TxForRecurring[]): RecurringGroup[] {
  const byKey = new Map<string, TxForRecurring[]>();
  for (const tx of transactions) {
    const key = merchantKey(tx.description);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(tx);
    byKey.set(key, list);
  }

  const groups: RecurringGroup[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 3) continue;

    // Amount clustering around the median (±10%, min $1 band) filters
    // one-off purchases at the same merchant out of a subscription group.
    const amounts = list.map((t) => Number(t.amount));
    const medianAmount = median(amounts);
    const band = Math.max(1, medianAmount * 0.1);
    const clustered = list
      .filter((t) => Math.abs(Number(t.amount) - medianAmount) <= band)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (clustered.length < 3) continue;

    const intervals: number[] = [];
    for (let i = 1; i < clustered.length; i++) {
      intervals.push(dayDiff(clustered[i - 1]!.date, clustered[i]!.date));
    }
    const medianInterval = median(intervals);
    const bandMatch = CADENCE_BANDS.find((b) => medianInterval >= b.min && medianInterval <= b.max);
    if (!bandMatch) continue;

    // Regularity: at least 75% of intervals inside the cadence band.
    const inBand = intervals.filter((d) => d >= bandMatch.min && d <= bandMatch.max).length;
    if (inBand / intervals.length < 0.75) continue;

    groups.push({
      recurrenceKey: `${key}|${bandMatch.cadence}`,
      cadence: bandMatch.cadence,
      transactionIds: clustered.map((t) => t.id),
      typicalAmount: medianAmount.toFixed(2),
    });
  }
  return groups;
}
