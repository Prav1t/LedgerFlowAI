import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { listDocumentsSchema } from "@/lib/validation/documents";
import { documentService } from "@/server/services/document.service";
import { ok } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/documents — paginated, filterable document list. */
export const GET = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const input = listDocumentsSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    return ok(await documentService.list(ctx.organizationId, input));
  },
  { permission: "documents:view" }
);
