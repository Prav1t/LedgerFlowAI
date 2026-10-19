import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { runCopilotTurn } from "@/server/services/copilot/agent";
import { ok } from "@/lib/utils/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // agent loop with tool round-trips

const bodySchema = z.object({ message: z.string().trim().min(1).max(4000) });

/** POST /api/v1/copilot/chats/:id/messages — one full agentic turn. */
export const POST = withAuth(
  async (req: NextRequest, ctx): Promise<NextResponse> => {
    const chatId = req.nextUrl.pathname.split("/").at(-2)!;
    const { message } = bodySchema.parse(await req.json());
    const result = await runCopilotTurn(ctx.organizationId, ctx.userId, chatId, message);
    return ok(result);
  },
  { permission: "copilot:use", rateLimit: { limit: 20, windowSeconds: 60 } }
);
