import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/prisma";
import {
  categorizationActionsSchema,
  categorizationConditionsSchema,
} from "@/server/automations/rule-engine";
import { ok, created, fail } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/automation-rules */
export const GET = withAuth(
  async (_req, ctx): Promise<NextResponse> => {
    const rules = await prisma.automationRule.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ type: "asc" }, { priority: "asc" }],
    });
    return ok(rules);
  },
  { permission: "automations:manage" }
);

const createSchema = z.object({
  type: z.literal("CATEGORIZATION"),
  name: z.string().min(2).max(80),
  conditions: categorizationConditionsSchema,
  actions: categorizationActionsSchema,
  priority: z.number().int().min(1).max(1000).default(100),
});

/** POST /api/v1/automation-rules — categorization rules (other types are system-driven). */
export const POST = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const input = createSchema.parse(await req.json());
    const account = await prisma.account.findUnique({
      where: {
        organizationId_code: { organizationId: ctx.organizationId, code: input.actions.setCategoryCode },
      },
    });
    if (!account || !account.isActive) {
      return fail(`No active account with code ${input.actions.setCategoryCode}`, 400);
    }
    const rule = await prisma.automationRule.create({
      data: { ...input, organizationId: ctx.organizationId },
    });
    return created(rule);
  },
  { permission: "automations:manage" }
);
