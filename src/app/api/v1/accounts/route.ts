import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/prisma";
import { accountBalance } from "@/server/accounting-engine/posting";
import { ok, created } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/accounts — chart of accounts with posted balances. */
export const GET = withAuth(
  async (_req, ctx): Promise<NextResponse> => {
    const [accounts, sums] = await Promise.all([
      prisma.account.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { code: "asc" },
      }),
      prisma.journalLine.groupBy({
        by: ["accountId"],
        where: { journalEntry: { organizationId: ctx.organizationId, status: "POSTED" } },
        _sum: { debit: true, credit: true },
      }),
    ]);
    const sumsById = new Map(sums.map((s) => [s.accountId, s._sum]));
    return ok(
      accounts.map((a) => {
        const s = sumsById.get(a.id);
        return {
          id: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
          parentId: a.parentId,
          isActive: a.isActive,
          isSystem: a.isSystem,
          balance: accountBalance(a.type, s?.debit?.toString() ?? 0, s?.credit?.toString() ?? 0).toFixed(2),
        };
      })
    );
  },
  { permission: "accounting:view" }
);

const createAccountSchema = z.object({
  code: z.string().regex(/^\d{3,6}$/, "Code must be 3–6 digits"),
  name: z.string().min(2).max(80),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  subtype: z.string().max(50).optional(),
  parentId: z.string().cuid().optional(),
});

/** POST /api/v1/accounts — add an account to the chart. */
export const POST = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const input = createAccountSchema.parse(await req.json());
    if (input.parentId) {
      const parent = await prisma.account.findFirst({
        where: { id: input.parentId, organizationId: ctx.organizationId },
      });
      if (!parent || parent.type !== input.type) {
        return NextResponse.json(
          { success: false, error: { message: "Parent must exist and share the account type" } },
          { status: 400 }
        );
      }
    }
    const account = await prisma.account.create({
      data: { ...input, organizationId: ctx.organizationId },
    });
    return created(account);
  },
  { permission: "accounting:manage_accounts" }
);
