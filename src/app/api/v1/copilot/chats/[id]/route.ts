import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/prisma";
import { ok, notFound } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";

/** GET /api/v1/copilot/chats/:id — messages for one conversation. */
export const GET = withAuth(
  async (req, ctx): Promise<NextResponse> => {
    const id = req.nextUrl.pathname.split("/").at(-1)!;
    const chat = await prisma.aiChat.findFirst({
      where: { id, organizationId: ctx.organizationId, userId: ctx.userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!chat) return notFound("Chat");
    return ok({
      id: chat.id,
      title: chat.title,
      messages: chat.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  },
  { permission: "copilot:use" }
);
