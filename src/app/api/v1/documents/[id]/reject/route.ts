import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { approvalService, ApprovalError } from "@/server/services/approval.service";
import { ok, fail } from "@/lib/utils/api-response";

const bodySchema = z.object({ reason: z.string().max(500).optional() }).default({});

/** POST /api/v1/documents/:id/reject */
export const POST = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-2)!;
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    try {
      await approvalService.reject(ctx.organizationId, ctx.userId, id, body.reason);
      return ok({ rejected: true });
    } catch (err) {
      if (err instanceof ApprovalError) return fail(err.message, err.status);
      throw err;
    }
  },
  { permission: "documents:review" }
);
