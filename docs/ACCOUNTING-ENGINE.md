# Accounting Engine

## Layering

```
accounting-engine/ (pure, no I/O — fully unit-tested)
  posting.ts        validateEntry · reversalLines · normalBalance · accountBalance
  entry-builder.ts  document → debit/credit line arrangement
services/
  journal.service.ts   numbering · periods · post · reverse · immutability
  approval.service.ts  review corrections · approve → entry · reject
```

## Invariants and where they live

| Invariant | Enforced by |
|---|---|
| Debits ≡ credits (to the cent) | `validateEntry` before every commit |
| ≥2 lines, one side per line, no negatives | `validateEntry` |
| Accounts must exist, be org-owned, active | `validateEntry` + service account fetch |
| Sequential gap-free entry numbers per org | unique constraint + retry loop in `createEntry` |
| No posting into CLOSED periods | `ensureOpenPeriod` (auto-opens missing months) |
| POSTED entries immutable | no update path exists; corrections = `reverseEntry` |
| An entry reversed at most once | `reversesId @unique` + service check |
| Every post/reverse/approve/reject audited | `auditLogRepository.record` |

## Approval → entry generation

| Document | Entry |
|---|---|
| INVOICE / BILL | Dr expense (net) · Dr GST ITC (2210) · Cr Accounts Payable (2000) |
| RECEIPT / CHECK | Dr expense (net) · Dr GST ITC · Cr bank (1010) |
| BANK_STATEMENT / other | approval only — transactions post via categorization |

Expense account resolution: reviewer's explicit pick → vendor default →
AI-suggested category (name match on expense accounts) → 6999 Uncategorized.
Nonsense tax extractions (negative, ≥ total) are dropped rather than
producing a broken entry. Reviewers correct fields (`isCorrected`, audit-logged)
before approving; approval is blocked client-side while corrections are unsaved.
