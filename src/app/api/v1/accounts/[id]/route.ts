import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/prisma";
import { ok, fail, notFound } from "@/lib/utils/api-response";

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/v1/accounts/:id — rename or (de)activate. System accounts stay active. */
export const PATCH = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-1)!;
    const input = patchSchema.parse(await req.json());

    const account = await prisma.account.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!account) return notFound("Account");
    if (account.isSystem && input.isActive === false) {
      return fail("System accounts can't be deactivated — the pipeline posts against them", 409);
    }

    const updated = await prisma.account.update({ where: { id }, data: input });
    return ok(updated);
  },
  { permission: "accounting:manage_accounts" }
);
