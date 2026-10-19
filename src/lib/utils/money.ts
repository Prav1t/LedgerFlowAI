import Decimal from "decimal.js";

/**
 * All monetary math flows through Decimal — never floating point.
 * Amounts are persisted as Prisma Decimal(19,4); this module is the
 * single conversion boundary between DB, engine, and UI.
 */
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export type Money = Decimal;

export const money = (value: Decimal.Value): Money => new Decimal(value);
export const ZERO: Money = new Decimal(0);

export function sum(values: Decimal.Value[]): Money {
  return values.reduce<Money>((acc, v) => acc.plus(v), ZERO);
}

export function formatMoney(value: Decimal.Value, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(new Decimal(value).toNumber());
}

/** Debits must equal credits to the cent. */
export function isBalanced(debits: Decimal.Value[], credits: Decimal.Value[]): boolean {
  return sum(debits).minus(sum(credits)).abs().lessThan(new Decimal("0.005"));
}
