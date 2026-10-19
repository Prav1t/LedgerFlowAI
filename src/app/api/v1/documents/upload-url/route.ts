import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { uploadRequestSchema } from "@/lib/validation/documents";
import { documentService } from "@/server/services/document.service";
import { created } from "@/lib/utils/api-response";

/** POST /api/v1/documents/upload-url — presigned PUT URLs for up to 20 files. */
export const POST = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const { files } = uploadRequestSchema.parse(await req.json());
    const uploads = await documentService.createPendingUploads(ctx.organizationId, ctx.userId, files);
    return created({ uploads });
  },
  { permission: "documents:upload", rateLimit: { limit: 30, windowSeconds: 60 } }
);
