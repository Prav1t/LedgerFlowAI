import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { billingService } from "@/server/services/billing.service";
import { ok } from "@/lib/utils/api-response";

/** POST /api/v1/billing/portal — Stripe customer portal (payment methods, cancel, invoices). */
export const POST = withAuth(
  async (_req, ctx): Promise<NextResponse> => {
    const url = await billingService.createPortalSession(ctx.organizationId);
    return ok({ url });
  },
  { permission: "org:manage_billing", rateLimit: { limit: 10, windowSeconds: 60 } }
);
