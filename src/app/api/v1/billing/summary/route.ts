import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { billingService } from "@/server/services/billing.service";
import { prisma } from "@/lib/db/prisma";
import { ok } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/billing/summary — plan, status, usage, renewal. Visible to the whole team. */
export const GET = withAuth(async (_req, ctx): Promise<NextResponse> => {
  const [entitlements, subscription] = await Promise.all([
    billingService.getEntitlements(ctx.organizationId),
    prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { currentPeriodEnd: true, cancelAtPeriodEnd: true, trialEndsAt: true },
    }),
  ]);
  return ok({
    ...entitlements,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
  });
});
