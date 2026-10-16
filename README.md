# LedgerFlow AI

AI-powered bookkeeping for accounting firms, finance teams, and small businesses.
Documents in → OCR → AI extraction → **human review** → double-entry journal entries → live reports.

## Feature map

- **Pipeline** — presigned drag-drop uploads (PDF/images/CSV/Excel) → Google
  Document AI OCR (spreadsheets parse directly) → GPT-5 classification +
  field extraction with strict structured outputs and Claude fallback →
  review screen with per-field confidence and corrections → approval
  generates a balanced journal entry.
- **Accounting engine** — pure double-entry core (balance validated to the
  cent), sequential gap-free entry numbers, period close, immutable posted
  entries with reversal-only corrections, full audit trail.
- **Reports** — trial balance, income statement, balance sheet, indirect
  cash flow (self-reconciling), all from posted ledger sums.
- **AI Copilot** — Claude with function-calling RAG over the org's live
  books; explains entries, compares periods, finds duplicate invoices,
  stages transaction categorization. Posting stays human-only.
- **Automations** — rule + vendor categorization, receipt↔transaction
  matching, recurring-charge detection, duplicate flagging, daily
  reminders, month-end checklist.
- **Platform** — Clerk auth (orgs, MFA, roles → 14 permissions), Stripe
  billing with plan limits enforced at upload, outbound HMAC-signed
  webhooks, OpenAPI docs at `/api-docs`, platform admin metrics, dark mode,
  ⌘K palette, `g`-key navigation.

## Stack

Next.js 15 · React 19 · TypeScript strict · Tailwind + shadcn-style UI ·
TanStack Query · Zustand · Prisma + PostgreSQL · Redis + BullMQ · Clerk ·
S3 · Google Document AI · OpenAI + Anthropic · Stripe · Vitest + Playwright.

## Local development

```bash
docker compose up -d                 # Postgres, Redis, MinIO
cp .env.example .env                 # fill in Clerk/OpenAI/Anthropic/Stripe test keys
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # → FIELD_ENCRYPTION_KEY
npm install
npm run db:migrate && npm run db:seed
npm run dev            # web — http://localhost:3000
npm run worker:dev     # pipeline worker (second terminal)
```

Quality gates: `npm run typecheck` · `npm run lint` · `npm test` (94 unit
tests) · `npm run test:e2e`.

## Documentation

| Doc | Covers |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | layering, tenancy, money handling, pipeline |
| [AUTH](docs/AUTH.md) | Clerk setup, roles/permissions, webhooks |
| [DATABASE](docs/DATABASE.md) | schema map, invariants, seed |
| [OCR](docs/OCR.md) | Document AI setup, extraction routing |
| [AI-PIPELINE](docs/AI-PIPELINE.md) | structured outputs, dual-LLM fallback |
| [ACCOUNTING-ENGINE](docs/ACCOUNTING-ENGINE.md) | posting invariants, approval → entry |
| [COPILOT](docs/COPILOT.md) | tools, agent loop, safety posture |
| [AUTOMATIONS](docs/AUTOMATIONS.md) | rules, matching, schedules |
| [BILLING](docs/BILLING.md) | plans, entitlements, Stripe sync |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Vercel + Railway runbook, verification |
