import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, ANTHROPIC_MODEL } from "@/lib/ai/clients";
import { prisma } from "@/lib/db/prisma";
import { toolDefinitions, executeTool } from "./tools";
import { logger } from "@/lib/utils/logger";

const MAX_ITERATIONS = 8;
const MAX_HISTORY_MESSAGES = 20;
const MAX_TOOL_RESULT_CHARS = 30_000;

const SYSTEM_PROMPT = `You are the LedgerFlow copilot — a bookkeeping assistant embedded in an accounting platform, with tools over this organization's live financial data (posted ledger, documents, bank transactions).

How to work:
- Ground every numeric claim in tool results. If you didn't retrieve it, don't state it.
- To explain changes (e.g. "why did expenses increase"), fetch the income statement for both periods and compare account by account.
- To explain a journal entry, fetch it by entryNumber and walk through each debit/credit in plain language.
- For a month-end report, combine income statement, balance sheet, and notable open items (unreviewed documents, uncategorized transactions).
- You may categorize bank transactions when asked; posting to the ledger always stays with humans.
- Amounts are in the organization's base currency. Be concise and concrete; small tables are welcome.
- If a question is outside this organization's books, say so briefly.`;

export interface CopilotTurnResult {
  content: string;
  toolCalls: Array<{ name: string; input: unknown }>;
  tokensUsed: number;
}

/**
 * One conversational turn: persist the user message, run the agentic
 * tool loop, persist the assistant reply (with its tool-call trace).
 * Tool errors go back to the model as is_error results — it can recover
 * (wrong date format, missing account) instead of the turn failing.
 */
export async function runCopilotTurn(
  organizationId: string,
  userId: string,
  chatId: string,
  userMessage: string
): Promise<CopilotTurnResult> {
  const chat = await prisma.aiChat.findFirst({ where: { id: chatId, organizationId, userId } });
  if (!chat) throw new Error("Chat not found");

  const history = await prisma.aiChatMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
    take: MAX_HISTORY_MESSAGES,
  });

  await prisma.aiChatMessage.create({ data: { chatId, role: "USER", content: userMessage } });
  if (history.length === 0) {
    await prisma.aiChat.update({
      where: { id: chatId },
      data: { title: userMessage.slice(0, 60) + (userMessage.length > 60 ? "…" : "") },
    });
  }

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const toolCalls: Array<{ name: string; input: unknown }> = [];
  let tokensUsed = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await anthropic().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
      tools: toolDefinitions,
    });
    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

    if (response.stop_reason !== "tool_use") {
      const content = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      await prisma.aiChatMessage.create({
        data: {
          chatId,
          role: "ASSISTANT",
          content: content || "(no response)",
          toolCalls: toolCalls.length > 0 ? (toolCalls as never) : undefined,
          tokensUsed,
        },
      });
      await prisma.aiChat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
      return { content, toolCalls, tokensUsed };
    }

    // Execute every tool call in this assistant turn, then continue the loop.
    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      toolCalls.push({ name: block.name, input: block.input });
      try {
        const result = await executeTool(block.name, block.input as Record<string, unknown>, { organizationId });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tool execution failed";
        logger.warn({ tool: block.name, err: message, chatId }, "Copilot tool error");
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: message, is_error: true });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  const fallback =
    "I hit the limit on data lookups for a single question. Try narrowing the question (a specific period, account, or entry number).";
  await prisma.aiChatMessage.create({
    data: { chatId, role: "ASSISTANT", content: fallback, toolCalls: toolCalls as never, tokensUsed },
  });
  return { content: fallback, toolCalls, tokensUsed };
}
