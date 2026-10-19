import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/prisma";
import { ok, notFound } from "@/lib/utils/api-response";

const patchSchema = z.object({ isActive: z.boolean() });

/** PATCH /api/v1/webhook-endpoints/:id — pause/resume. */
export const PATCH = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-1)!;
    const input = patchSchema.parse(await req.json());
    const { count } = await prisma.webhookEndpoint.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: input,
    });
    if (count === 0) return notFound("Endpoint");
    return ok({ updated: true });
  },
  { permission: "org:manage_settings" }
);

/** DELETE /api/v1/webhook-endpoints/:id */
export const DELETE = withAuth(
  async (req, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-1)!;
    const { count } = await prisma.webhookEndpoint.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });
    if (count === 0) return notFound("Endpoint");
    return ok({ deleted: true });
  },
  { permission: "org:manage_settings" }
);
