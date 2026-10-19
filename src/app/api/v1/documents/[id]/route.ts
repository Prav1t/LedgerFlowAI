import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { documentRepository } from "@/server/repositories/document.repository";
import { documentService, DocumentServiceError } from "@/server/services/document.service";
import { createSignedDownloadUrl } from "@/lib/storage/s3";
import { ok, fail, notFound } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/documents/:id — full document with fields + a viewing URL. */
export const GET = withAuth(
  async (req, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-1)!;
    const document = await documentRepository.findById(ctx.organizationId, id);
    if (!document) return notFound("Document");
    const downloadUrl = await createSignedDownloadUrl(document.storageKey);
    return ok({ ...document, downloadUrl });
  },
  { permission: "documents:view" }
);

/** DELETE /api/v1/documents/:id */
export const DELETE = withAuth(
  async (req, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-1)!;
    try {
      await documentService.remove(ctx.organizationId, ctx.userId, id);
      return ok({ deleted: true });
    } catch (err) {
      if (err instanceof DocumentServiceError) return fail(err.message, err.status);
      throw err;
    }
  },
  { permission: "documents:delete" }
);
