import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { journalService } from "@/server/services/journal.service";
import { PostingError } from "@/server/accounting-engine/posting";
import { ok, fail } from "@/lib/utils/api-response";

/** POST /api/v1/journal-entries/:id/reverse — the only correction path for posted entries. */
export const POST = withAuth(
  async (req, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-2)!;
    try {
      const reversal = await journalService.reverseEntry(ctx.organizationId, ctx.userId, id);
      return ok({ reversalId: reversal.id, entryNumber: reversal.entryNumber });
    } catch (err) {
      if (err instanceof PostingError) return fail(err.message, 422, err.code);
      throw err;
    }
  },
  { permission: "accounting:post" }
);
