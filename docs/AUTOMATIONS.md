# Automation Engine

Pure cores in `src/server/automations/` (rule-engine, recurring, matching —
all unit-tested), orchestrated by `automation.service.ts`, executed by the
automations worker. Automations only **stage** data: categories, matches,
flags, notifications. Ledger posting always stays with humans.

## Triggers

| Trigger | Runs |
|---|---|
| After every extraction (pipeline stage 3) | duplicate check for that document + full sweep |
| "Run automations" button (`POST /api/v1/automations/run`) | full sweep for the org |
| Daily 13:00 UTC (BullMQ repeatable) | reminders: overdue payables, review queue stale 3+ days (deduped per day) |
| 1st of month 14:00 UTC | month-end checklist notification with live open-item counts |

## Passes

- **Auto-categorization** — org rules first (priority order, first match wins;
  malformed stored rules are skipped, never crash the worker), then vendor
  fallback: a vendor's normalized name appearing in the description applies
  that vendor's default account.
- **Receipt ↔ transaction matching** — exact amount required, ≤5 days apart,
  ties broken by merchant-token overlap, greedy one-to-one. Matches set
  `Receipt.matchedTransactionId` and transaction → MATCHED.
- **Recurring detection** — merchant key (store numbers/dates stripped) +
  amount clustering (±10% of median) + cadence bands
  (weekly/biweekly/monthly/quarterly/yearly, ≥3 charges, ≥75% of intervals
  in band) → `recurrenceKey`, shown as a ↻ badge on transactions.
- **Duplicate invoices** — on extraction, the new invoice is checked against
  all existing (vendor+number, vendor+amount+date); hits set
  `Document.duplicateOfId` and raise a DUPLICATE_DETECTED notification.

## Rules

`AutomationRule` (type CATEGORIZATION) — conditions
`{descriptionContains?, direction?, amountMin?, amountMax?}` → actions
`{setCategoryCode}`. Managed at `/settings/automations`; validated by the
same Zod schemas at the API boundary and at evaluation time.
