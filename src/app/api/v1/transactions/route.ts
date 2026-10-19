import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/prisma";
import { ok } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(["UNCATEGORIZED", "CATEGORIZED", "MATCHED", "RECONCILED", "EXCLUDED"]).optional(),
});

/** GET /api/v1/transactions — bank transactions with categories. */
export const GET = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const input = listSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const where = {
      organizationId: ctx.organizationId,
      ...(input.status && { status: input.status }),
    };
    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          categoryAccount: { select: { code: true, name: true } },
          bankAccount: { select: { name: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);
    return ok({
      items: items.map((t) => ({
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        description: t.description,
        amount: t.amount.toFixed(2),
        direction: t.direction,
        status: t.status,
        recurrenceKey: t.recurrenceKey,
        bankAccount: t.bankAccount.name,
        category: t.categoryAccount ? `${t.categoryAccount.code} · ${t.categoryAccount.name}` : null,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      hasMore: input.page * input.pageSize < total,
    });
  },
  { permission: "accounting:view" }
);

const patchSchema = z.object({
  transactionId: z.string().cuid(),
  accountId: z.string().cuid().nullable(),
});

/** PATCH /api/v1/transactions — set/clear a transaction's category. */
export const PATCH = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const { transactionId, accountId } = patchSchema.parse(await req.json());
    if (accountId) {
      const account = await prisma.account.findFirst({
        where: { id: accountId, organizationId: ctx.organizationId, isActive: true },
      });
      if (!account) return NextResponse.json({ success: false, error: { message: "Account not found" } }, { status: 400 });
    }
    const { count } = await prisma.transaction.updateMany({
      where: { id: transactionId, organizationId: ctx.organizationId, status: { not: "RECONCILED" } },
      data: { categoryAccountId: accountId, status: accountId ? "CATEGORIZED" : "UNCATEGORIZED" },
    });
    return ok({ updated: count === 1 });
  },
  { permission: "accounting:view" }
);
