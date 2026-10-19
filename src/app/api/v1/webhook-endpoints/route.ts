import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/prisma";
import { webhookService, WEBHOOK_EVENTS } from "@/server/services/webhook.service";
import { ok, created } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/webhook-endpoints — endpoints + recent delivery health. */
export const GET = withAuth(
  async (_req, ctx): Promise<NextResponse> => {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        deliveries: { orderBy: { createdAt: "desc" }, take: 5, select: { status: true, responseStatus: true, createdAt: true } },
      },
    });
    return ok(endpoints);
  },
  { permission: "org:manage_settings" }
);

const createSchema = z.object({
  url: z.string().url().refine((u) => u.startsWith("https://"), "Webhook URLs must be https"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

/** POST /api/v1/webhook-endpoints — the signing secret is returned once, here. */
export const POST = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const input = createSchema.parse(await req.json());
    const endpoint = await webhookService.createEndpoint(ctx.organizationId, input.url, input.events);
    return created(endpoint);
  },
  { permission: "org:manage_settings" }
);
