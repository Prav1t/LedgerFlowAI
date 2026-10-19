# LedgerFlow AI — Architecture

## System overview

```
                        ┌──────────────────────────────┐
  Browser ──────────────▶  Next.js 15 (Vercel)          │
   │  presigned PUT      │  App Router · RSC · API v1   │
   │                     └───────┬───────────┬──────────┘
   ▼                             │           │
  S3-compatible storage          │           │ enqueue
  (documents)                    │           ▼
                                 │   ┌──────────────────┐      ┌────────────┐
                                 │   │ Redis + BullMQ   │◀────▶│  Worker     │
                                 │   └──────────────────┘      │  (Railway)  │
                                 ▼                             │  OCR → AI → │
                        ┌──────────────────┐                   │  Posting    │
                        │  PostgreSQL      │◀──────────────────┘
                        │  (Prisma)        │
                        └──────────────────┘

  External: Clerk (auth) · Google Document AI (OCR) · OpenAI + Anthropic (extraction/copilot) · Stripe (billing)
```

Two deployable processes share one codebase:

| Process | Runs | Where |
|---|---|---|
| **web** | Next.js server (UI + REST API) | Vercel (or Docker `web` target) |
| **worker** | BullMQ processors (`src/workers`) | Railway (or Docker `worker` target) |

Heavy work (OCR, LLM extraction, posting) never runs in a request handler.
API routes enqueue; workers execute; the UI polls/streams job status.

## Layering rules

```
src/
├─ app/            Route handlers + pages. Thin: parse → validate → call service → respond.
├─ components/     Presentation only. No fetch logic outside hooks.
├─ hooks/          TanStack Query hooks — the only place the client touches /api.
├─ stores/         Zustand for ephemeral UI state (panels, selection, shortcuts).
├─ lib/            Cross-cutting adapters: db, redis, queue, storage, ai, ocr, stripe, utils.
├─ server/
│  ├─ services/            Use-cases. Orchestrate repositories + engine + queues. Own transactions.
│  ├─ repositories/        All Prisma queries. Every query takes organizationId — no exceptions.
│  ├─ accounting-engine/   Pure domain logic: posting, trial balance, statements. No I/O.
│  └─ automations/         Rule evaluation: categorization, dedupe, matching.
└─ workers/        BullMQ processors. Call the same services as API routes.
```

Dependency direction: `app → services → (repositories | engine | lib)`.
The engine imports nothing from Prisma or Next — it is pure and unit-testable.

## Multi-tenancy & security

- Every tenant-owned row carries `organizationId`; repositories require it as a parameter,
  making cross-tenant reads a compile-time impossibility rather than a code-review hope.
- Clerk Organizations map 1:1 to our `Organization` rows (synced via webhook, Phase 2).
- Sensitive fields (bank account numbers, API secrets) are AES-256-GCM encrypted at the
  field level (`lib/utils/crypto.ts`) on top of disk encryption.
- Uploads use short-lived presigned URLs; the API never proxies file bytes.
- Sliding-window rate limiting per org+route via Redis (`lib/utils/rate-limit.ts`).
- Journal entries are immutable once posted: corrections are reversing entries,
  preserving a complete audit trail (enforced in the engine, Phase 8).

## Money

All monetary math uses `decimal.js` via `lib/utils/money.ts`; Postgres stores
`Decimal(19,4)`. Floating point never touches an amount. Double-entry balance
is validated (`isBalanced`) before any posting transaction commits.

## Document pipeline (Phases 5–8)

```
upload (presigned) → Document row (UPLOADED)
  → ocrQueue: Document AI → raw text + layout (OCR_PROCESSING)
  → aiExtractionQueue: classify type → extract typed fields as strict JSON
      (OpenAI structured outputs, Claude fallback) + confidence (EXTRACTING)
  → confidence < 0.92 or policy → NEEDS_REVIEW (human screen)
  → approve → journalPostingQueue: engine drafts balanced entry → post (POSTED)
  → ledger, reports, dashboards update
```

## API

REST under `/api/v1`, uniform envelope (`lib/utils/api-response.ts`):
`{ success, data }` or `{ success: false, error: { message, code, issues } }`.
OpenAPI spec + Swagger UI ship in the API phase. Webhooks (Stripe, Clerk)
verify signatures and are excluded from Clerk middleware.

## Build plan

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Architecture + scaffold (this) | ✅ |
| 2 | Clerk auth, orgs, roles, admin gate | ⏳ |
| 3 | Full Prisma schema + migrations + seed | |
| 4 | Dashboard UI | |
| 5 | Uploads (presigned, drag-drop, progress) | |
| 6 | Google Document AI integration | |
| 7 | AI extraction (structured outputs) | |
| 8 | Accounting engine | |
| 9 | Reports (TB, IS, BS, CF) | |
| 10 | AI Copilot (RAG) | |
| 11 | Automation engine | |
| 12 | Stripe billing | |
| 13 | Deployment hardening | |
