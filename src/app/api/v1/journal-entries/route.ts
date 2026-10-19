import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { journalService } from "@/server/services/journal.service";
import { PostingError } from "@/server/accounting-engine/posting";
import { ok, created, fail } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "POSTED", "REVERSED"]).optional(),
});

/** GET /api/v1/journal-entries */
export const GET = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const input = listSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const result = await journalService.list(ctx.organizationId, input);
    return ok({
      ...result,
      items: result.items.map(serializeEntry),
    });
  },
  { permission: "accounting:view" }
);

const lineSchema = z.object({
  accountId: z.string().cuid(),
  debit: z.string().regex(/^\d+(\.\d{1,4})?$/),
  credit: z.string().regex(/^\d+(\.\d{1,4})?$/),
  memo: z.string().max(200).optional(),
});

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().max(200).optional(),
  lines: z.array(lineSchema).min(2).max(50),
  sourceType: z.enum(["MANUAL", "ADJUSTMENT"]).default("MANUAL"),
  post: z.boolean().default(false),
});

/** POST /api/v1/journal-entries — manual or adjusting entry (draft by default). */
export const POST = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const input = createSchema.parse(await req.json());
    try {
      const entry = await journalService.createEntry(ctx.organizationId, ctx.userId, input);
      return created(serializeEntry(entry));
    } catch (err) {
      if (err instanceof PostingError) return fail(err.message, 422, err.code);
      throw err;
    }
  },
  { permission: "accounting:post" }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeEntry(entry: any) {
  return {
    id: entry.id,
    entryNumber: entry.entryNumber,
    date: entry.date.toISOString().slice(0, 10),
    memo: entry.memo,
    status: entry.status,
    sourceType: entry.sourceType,
    postedAt: entry.postedAt?.toISOString() ?? null,
    createdBy: entry.createdBy ? [entry.createdBy.firstName, entry.createdBy.lastName].filter(Boolean).join(" ") : null,
    lines: entry.lines.map((l: { id: string; accountId: string; debit: unknown; credit: unknown; memo: string | null; account?: { code: string; name: string } }) => ({
      id: l.id,
      accountId: l.accountId,
      accountCode: l.account?.code ?? null,
      accountName: l.account?.name ?? null,
      debit: String(l.debit),
      credit: String(l.credit),
      memo: l.memo,
    })),
  };
}
