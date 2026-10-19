import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { documentService, DocumentServiceError } from "@/server/services/document.service";
import { ok, fail } from "@/lib/utils/api-response";

/** POST /api/v1/documents/:id/complete — browser confirms S3 PUT; pipeline starts. */
export const POST = withAuth(
  async (req, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-2)!;
    try {
      return ok(await documentService.completeUpload(ctx.organizationId, ctx.userId, id));
    } catch (err) {
      if (err instanceof DocumentServiceError) return fail(err.message, err.status);
      throw err;
    }
  },
  { permission: "documents:upload" }
);
