# Database

Postgres via Prisma. Full schema in `prisma/schema.prisma`. Highlights:

## Entity map

```
Organization ─┬─ OrganizationMember ── User
              ├─ Account (chart of accounts, self-referencing hierarchy)
              │    └─ JournalLine ── JournalEntry ── AccountingPeriod
              ├─ BankAccount ─┬─ Transaction ── (category Account, JournalEntry)
              │               ├─ BankStatement ── Document
              │               └─ Reconciliation
              ├─ Document ─┬─ ExtractedField (key/value + confidence + bbox)
              │            ├─ Invoice / Receipt / Check (typed views)
              │            └─ Job (pipeline tracking)
              ├─ Vendor (normalized name, default category)
              ├─ Notification · AiChat/AiChatMessage · AuditLog
              ├─ WebhookEndpoint ── WebhookDelivery
              ├─ AutomationRule (conditions/actions JSON)
              └─ Subscription (Stripe)
```

## Invariants the schema enforces

- `Account @@unique([organizationId, code])` — no duplicate codes per org.
- `JournalEntry @@unique([organizationId, entryNumber])` — gap-free sequential
  numbering assigned inside the posting transaction (Phase 8).
- `JournalEntry.reversesId @unique` — an entry can be reversed at most once.
- `Transaction @@unique([bankAccountId, dedupeHash])` — statement re-imports
  can't duplicate transactions (hash of account|date|amount|description).
- `ExtractedField @@unique([documentId, key])` — one value per field, corrections
  update in place with `isCorrected` flagged.
- `Vendor @@unique([organizationId, normalizedName])` — vendor matching target.
- One `Invoice`/`Receipt`/`Check`/`BankStatement` per `Document` (unique FK).

## Invariants the engine enforces (Phase 8)

Prisma can't express "debits equal credits" or "posted entries are immutable" —
those live in the posting engine, which validates balance before commit and
refuses UPDATE/DELETE on posted entries (corrections = reversing entries).

## Provisioning & seed

- Every new org gets the default chart (~45 accounts, `default-chart.ts`)
  via the Clerk `organization.created` webhook — idempotent, retry-safe.
- `npm run db:seed` creates a demo org ("Maple Freight Co.") with balanced
  posted entries, vendors, and uncategorized bank transactions. Guarded
  against production.

## Migrations

```bash
npm run db:migrate     # dev: create + apply migration
npm run db:deploy      # prod: apply committed migrations (runs in CI/CD)
```
