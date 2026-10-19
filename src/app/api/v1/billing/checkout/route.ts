import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { billingService } from "@/server/services/billing.service";
import { ok } from "@/lib/utils/api-response";

const bodySchema = z.object({ plan: z.enum(["STARTER", "PROFESSIONAL", "FIRM"]) });

/** POST /api/v1/billing/checkout — Stripe Checkout session for a plan. Owners only. */
export const POST = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const { plan } = bodySchema.parse(await req.json());
    const url = await billingService.createCheckoutSession(ctx.organizationId, plan);
    return ok({ url });
  },
  { permission: "org:manage_billing", rateLimit: { limit: 10, windowSeconds: 60 } }
);
