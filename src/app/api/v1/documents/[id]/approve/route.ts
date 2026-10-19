import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { approvalService, ApprovalError } from "@/server/services/approval.service";
import { PostingError } from "@/server/accounting-engine/posting";
import { ok, fail } from "@/lib/utils/api-response";

const bodySchema = z.object({ expenseAccountId: z.string().cuid().optional() }).default({});

/** POST /api/v1/documents/:id/approve — human approval → journal entry → POSTED. */
export const POST = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-2)!;
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    try {
      return ok(await approvalService.approve(ctx.organizationId, ctx.userId, id, body));
    } catch (err) {
      if (err instanceof ApprovalError) return fail(err.message, err.status);
      if (err instanceof PostingError) return fail(err.message, 422, err.code);
      throw err;
    }
  },
  { permission: "documents:review" }
);
