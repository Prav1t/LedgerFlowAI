import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { approvalService, ApprovalError } from "@/server/services/approval.service";
import { ok, fail } from "@/lib/utils/api-response";

const bodySchema = z.object({
  corrections: z
    .array(z.object({ key: z.string().min(1).max(64), value: z.string().max(2000) }))
    .min(1)
    .max(50),
});

/** PATCH /api/v1/documents/:id/fields — reviewer corrections before approval. */
export const PATCH = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-2)!;
    const { corrections } = bodySchema.parse(await req.json());
    try {
      await approvalService.correctFields(ctx.organizationId, ctx.userId, id, corrections);
      return ok({ corrected: corrections.length });
    } catch (err) {
      if (err instanceof ApprovalError) return fail(err.message, err.status);
      throw err;
    }
  },
  { permission: "documents:review" }
);
