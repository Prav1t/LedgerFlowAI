# Authentication & Authorization

## Model

Clerk owns **authentication** (credentials, sessions, MFA, org invitations).
LedgerFlow owns **authorization** (what a member may do), driven by
`ROLE_PERMISSIONS` in `src/lib/auth/permissions.ts`.

```
Clerk session ──▶ getAuthContext() ──▶ { userId, organizationId, role }
                                            │
                     withAuth(handler, { permission }) — API routes
                     requirePermission(...) — server components
```

Identity state is mirrored into Postgres via the Clerk webhook
(`/api/v1/webhooks/clerk`, svix-verified) so domain rows can FK to local ids
and queries never call Clerk's API on the hot path. Out-of-order webhook
delivery self-heals: the handler returns 500 and Clerk retries.

## Roles

| Role | Adds |
|---|---|
| VIEWER | View documents, ledger, reports, team roster |
| REVIEWER | + upload, review/approve extractions, copilot |
| ACCOUNTANT | + post entries, manage accounts, period close, automations, delete docs |
| ADMIN | + manage members and org settings |
| OWNER | + billing |

Nobody can assign a role at or above their own (`canAssignRole`).
Platform staff (`User.isPlatformAdmin`) gate the `/admin` area — a DB flag set
by an operator, never grantable from the product UI, orthogonal to org roles.

## Clerk dashboard configuration (one-time)

1. **Enable Organizations** (Configure → Organizations).
2. **MFA**: Configure → Multi-factor → enable *Authenticator application (TOTP)*
   and *Backup codes* (SMS optional). Users enroll at `/settings/security`.
3. **Password reset**: enabled by default; the `<SignIn />` component includes
   the full forgot-password flow.
4. **Webhook**: Add endpoint `https://<domain>/api/v1/webhooks/clerk`,
   subscribe to `user.*`, `organization.*`, `organizationMembership.*`,
   copy the signing secret into `CLERK_WEBHOOK_SECRET`.
   For local dev: `clerk webhook forward --url http://localhost:3000/api/v1/webhooks/clerk` or an ngrok tunnel.

## Route protection

- `src/middleware.ts` — session gate for everything non-public.
- `(dashboard)/layout.tsx` — redirects to `/onboarding` when no org is active.
- `(admin)/admin/layout.tsx` — platform admin gate.
- API routes wrap handlers in `withAuth`, adding permission checks,
  per-org rate limiting, and uniform error envelopes.
