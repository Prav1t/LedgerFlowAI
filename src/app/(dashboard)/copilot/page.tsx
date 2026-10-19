"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus, Send, Sparkles, Wrench, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChatMessages, useChats, useCreateChat, useSendMessage, type ChatMessage } from "@/hooks/use-copilot";
import { cn } from "@/lib/utils/cn";

const SUGGESTIONS = [
  "What caused expenses to increase this month?",
  "Categorize my uncategorized transactions",
  "Find duplicate invoices",
  "Generate a month-end report",
];

export default function CopilotPage() {
  const { data: chats, isPending: chatsLoading } = useChats();
  const createChat = useCreateChat();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const { data: chat } = useChatMessages(activeChatId);
  const sendMessage = useSendMessage();
  const [input, setInput] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeChatId && chats && chats.length > 0) setActiveChatId(chats[0]!.id);
  }, [chats, activeChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length, pendingUserMessage, sendMessage.isPending]);

  useEffect(() => {
    if (!sendMessage.isPending) setPendingUserMessage(null);
  }, [sendMessage.isPending]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sendMessage.isPending) return;
    let chatId = activeChatId;
    if (!chatId) {
      const created = await createChat.mutateAsync();
      chatId = created.id;
      setActiveChatId(chatId);
    }
    setPendingUserMessage(message);
    setInput("");
    sendMessage.mutate({ chatId, message });
  };

  const messages = chat?.messages ?? [];

  return (
    <div className="mx-auto grid h-[calc(100vh-7.5rem)] max-w-6xl gap-4 lg:grid-cols-[240px_1fr]">
      {/* Chat list */}
      <aside className="hidden flex-col overflow-hidden rounded-lg border bg-surface lg:flex">
        <div className="border-b p-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            disabled={createChat.isPending}
            onClick={async () => {
              const created = await createChat.mutateAsync();
              setActiveChatId(created.id);
            }}
          >
            <MessageSquarePlus className="h-4 w-4" /> New chat
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {chatsLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          {chats?.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveChatId(c.id)}
              className={cn(
                "w-full rounded-md px-2.5 py-2 text-left transition-colors",
                c.id === activeChatId ? "bg-accent" : "hover:bg-accent/50"
              )}
            >
              <p className="truncate text-sm">{c.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      <div className="flex flex-col overflow-hidden rounded-lg border bg-surface">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && !pendingUserMessage ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </span>
              <div>
                <h2 className="font-medium">Ask about your books</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  The copilot answers with live data from your ledger, documents, and bank transactions.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-md border px-3 py-2 text-left text-xs transition-colors hover:bg-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {pendingUserMessage && (
                <MessageBubble
                  message={{ id: "pending", role: "USER", content: pendingUserMessage, toolCalls: null, createdAt: "" }}
                />
              )}
              {sendMessage.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking the books…
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        <form
          className="flex items-center gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about expenses, entries, duplicates…"
            className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || sendMessage.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "USER";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary"
        )}
      >
        {message.toolCalls && message.toolCalls.length > 0 && (
          <p className="mb-1.5 flex flex-wrap items-center gap-1 text-[11px] opacity-70">
            <Wrench className="h-3 w-3" />
            {[...new Set(message.toolCalls.map((t) => t.name))].join(" · ")}
          </p>
        )}
        <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
      </div>
    </div>
  );
}
