# Billing (Stripe)

## Model

One `Subscription` row per org (`stripeCustomerId` unique). No row = in-app
trial with Professional limits (`entitlementsFor(null)`), so new orgs get
full value before touching Stripe.

| Tier | Docs/mo | Members |
|---|---|---|
| Starter $29 | 50 | 3 |
| Professional $99 | 500 | 10 |
| Firm $299 | 5,000 | unlimited |

## Flows

- **Checkout** — `POST /api/v1/billing/checkout {plan}` (OWNER only) →
  Stripe Checkout session; customer created lazily with
  `metadata.organizationId`; redirects back to `/settings/billing`.
- **Portal** — `POST /api/v1/billing/portal` → Stripe customer portal
  (payment methods, invoices, cancel, plan changes with proration).
- **Sync** — `/api/v1/webhooks/stripe` (signature-verified, retry-safe,
  idempotent): `customer.subscription.created/updated` and
  `checkout.session.completed` → `syncSubscription` (plan from price id,
  status mapping with a safe CANCELED default for unknown Stripe statuses,
  period end, cancel-at-period-end, trial end). `…deleted` → CANCELED.
  Orphaned customers recover via subscription metadata. PAST_DUE raises a
  BILLING notification.

## Enforcement

`billingService.getEntitlements(orgId)` = plan limits + this month's document
count. `createPendingUploads` gates before presigning:
- inactive subscription (CANCELED/INCOMPLETE) → 402, uploads paused
  (PAST_DUE keeps a grace window; read access always stays on)
- batch would exceed the monthly cap → 402 with remaining count and the plan
  named, exact-at-limit allowed (tested)

## Setup

Create three recurring prices in Stripe, set `STRIPE_PRICE_STARTER/
PROFESSIONAL/FIRM`, `STRIPE_SECRET_KEY`, and add a webhook endpoint for
`customer.subscription.*` + `checkout.session.completed` →
`STRIPE_WEBHOOK_SECRET`. Local dev:
`stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe`.
