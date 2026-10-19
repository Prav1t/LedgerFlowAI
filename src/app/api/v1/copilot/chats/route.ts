import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/prisma";
import { ok, created } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/copilot/chats — the caller's conversations, newest first. */
export const GET = withAuth(
  async (_req, ctx): Promise<NextResponse> => {
    const chats = await prisma.aiChat.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, title: true, updatedAt: true },
    });
    return ok(chats);
  },
  { permission: "copilot:use" }
);

/** POST /api/v1/copilot/chats — start a conversation. */
export const POST = withAuth(
  async (_req, ctx): Promise<NextResponse> => {
    const chat = await prisma.aiChat.create({
      data: { organizationId: ctx.organizationId, userId: ctx.userId },
      select: { id: true, title: true, updatedAt: true },
    });
    return created(chat);
  },
  { permission: "copilot:use" }
);
