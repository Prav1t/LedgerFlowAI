import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { reportsService } from "@/server/services/reports.service";
import { ok, fail } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const asOfSchema = z.object({ asOf: isoDay });
const rangeSchema = z
  .object({ from: isoDay, to: isoDay })
  .refine((r) => r.from <= r.to, { message: "'from' must not be after 'to'" });

const at = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * GET /api/v1/reports/:type
 *   trial-balance?asOf= · balance-sheet?asOf=
 *   income-statement?from=&to= · cash-flow?from=&to=
 */
export const GET = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const type = req.nextUrl.pathname.split("/").at(-1)!;
    const params = Object.fromEntries(req.nextUrl.searchParams);

    switch (type) {
      case "trial-balance": {
        const { asOf } = asOfSchema.parse(params);
        return ok(await reportsService.trialBalance(ctx.organizationId, at(asOf)));
      }
      case "balance-sheet": {
        const { asOf } = asOfSchema.parse(params);
        return ok(await reportsService.balanceSheet(ctx.organizationId, at(asOf)));
      }
      case "income-statement": {
        const { from, to } = rangeSchema.parse(params);
        return ok(await reportsService.incomeStatement(ctx.organizationId, at(from), at(to)));
      }
      case "cash-flow": {
        const { from, to } = rangeSchema.parse(params);
        return ok(await reportsService.cashFlow(ctx.organizationId, at(from), at(to)));
      }
      default:
        return fail(`Unknown report type: ${type}`, 404);
    }
  },
  { permission: "accounting:view" }
);
