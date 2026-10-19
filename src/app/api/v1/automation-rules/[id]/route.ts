import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/prisma";
import { ok, notFound } from "@/lib/utils/api-response";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  priority: z.number().int().min(1).max(1000).optional(),
  name: z.string().min(2).max(80).optional(),
});

/** PATCH /api/v1/automation-rules/:id */
export const PATCH = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-1)!;
    const input = patchSchema.parse(await req.json());
    const { count } = await prisma.automationRule.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: input,
    });
    if (count === 0) return notFound("Rule");
    return ok({ updated: true });
  },
  { permission: "automations:manage" }
);

/** DELETE /api/v1/automation-rules/:id */
export const DELETE = withAuth(
  async (req, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-1)!;
    const { count } = await prisma.automationRule.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });
    if (count === 0) return notFound("Rule");
    return ok({ deleted: true });
  },
  { permission: "automations:manage" }
);
