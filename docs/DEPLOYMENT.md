# Deployment Runbook

Two processes, one repo:

| Process | Platform | Entry |
|---|---|---|
| web (Next.js UI + API) | Vercel (`vercel.json`) | `next start` |
| worker (BullMQ pipeline) | Railway (`railway.toml`) or Docker `worker` target | `npm run worker` |

Shared backing services: **PostgreSQL** (Railway/Neon/RDS), **Redis**
(Railway/Upstash — worker needs a real TCP Redis for BullMQ), **S3-compatible
bucket** (S3/R2).

## 1. Provision

1. Postgres → set `DATABASE_URL` + `DIRECT_URL`.
2. Redis → `REDIS_URL` (same instance for web enqueue + worker).
3. Bucket → credentials + **CORS for browser presigned PUTs**:
   ```json
   [{
     "AllowedOrigins": ["https://<your-domain>"],
     "AllowedMethods": ["PUT"],
     "AllowedHeaders": ["content-type"],
     "MaxAgeSeconds": 3600
   }]
   ```
4. Generate `FIELD_ENCRYPTION_KEY`:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

## 2. External services

- **Clerk** — enable Organizations + MFA; webhook →
  `https://<domain>/api/v1/webhooks/clerk` (`user.*`, `organization.*`,
  `organizationMembership.*`) → `CLERK_WEBHOOK_SECRET`. (docs/AUTH.md)
- **Google Document AI** — Document OCR processor + service-account JSON.
  (docs/OCR.md)
- **OpenAI / Anthropic** — API keys; models overridable via
  `OPENAI_MODEL` / `ANTHROPIC_MODEL`.
- **Stripe** — three recurring prices → `STRIPE_PRICE_*`; webhook →
  `https://<domain>/api/v1/webhooks/stripe`
  (`customer.subscription.*`, `checkout.session.completed`) →
  `STRIPE_WEBHOOK_SECRET`. (docs/BILLING.md)

## 3. Deploy

- **Vercel**: import repo, set all env vars from `.env.example`. Deploys on
  push to `main`.
- **Railway worker**: new service from the same repo (`railway.toml` picks
  the worker start command); set the same env vars. Cron schedules
  (daily reminders, month-end) self-register on worker boot, idempotently.
- **Migrations**: `.github/workflows/deploy.yml` runs
  `prisma migrate deploy` against production before the worker ships —
  set `DATABASE_URL`, `DIRECT_URL`, `RAILWAY_TOKEN` repo secrets.
- **Docker alternative**: `docker/Dockerfile` has `web` (standalone Next)
  and `worker` targets.

## 4. Verify

1. `GET /api/health` → `{status:"healthy"}` (checks Postgres + Redis).
2. Sign up → org onboarding → chart of accounts auto-provisioned
   (Clerk webhook round-trip).
3. Upload a PDF receipt → watch it move UPLOADED → Reading → Extracting →
   Needs review (worker logs show each stage).
4. Approve → journal entry posts → dashboard + reports update.
5. `/api-docs` renders the API reference; `/admin` (after setting
   `isPlatformAdmin` on your user) shows live metrics.

## Ops notes

- Posted entries are immutable; period close blocks backdated posting.
- All pipeline stages are idempotent/retry-safe: re-running a document
  can't duplicate fields, transactions (dedupe hash), or entries.
- Rate limits are per-org+route in Redis; tune in `withAuth` call sites.
- Logs are structured (pino) with sensitive-field redaction.
