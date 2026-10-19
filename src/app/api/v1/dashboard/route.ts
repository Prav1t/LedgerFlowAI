import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { getDashboardData } from "@/server/services/dashboard.service";
import { ok } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/dashboard — financial overview aggregates for the active org. */
export const GET = withAuth(
  async (_req, ctx): Promise<NextResponse> => ok(await getDashboardData(ctx.organizationId)),
  { permission: "accounting:view" }
);
