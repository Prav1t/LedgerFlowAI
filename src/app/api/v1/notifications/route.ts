import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/prisma";
import { ok } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/notifications — latest 20 for the org (personal + broadcast). */
export const GET = withAuth(async (_req, ctx): Promise<NextResponse> => {
  const notifications = await prisma.notification.findMany({
    where: { organizationId: ctx.organizationId, OR: [{ userId: null }, { userId: ctx.userId }] },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return ok(notifications);
});

const markReadSchema = z.object({ ids: z.array(z.string().cuid()).min(1).max(100) });

/** PATCH /api/v1/notifications — mark a set as read. */
export const PATCH = withAuth(async (req: NextRequest, ctx): Promise<NextResponse> => {
  const { ids } = markReadSchema.parse(await req.json());
  const result = await prisma.notification.updateMany({
    where: { id: { in: ids }, organizationId: ctx.organizationId, readAt: null },
    data: { readAt: new Date() },
  });
  return ok({ marked: result.count });
});
