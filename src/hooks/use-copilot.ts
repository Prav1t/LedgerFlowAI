"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils/fetcher";

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "TOOL";
  content: string;
  toolCalls: Array<{ name: string; input: unknown }> | null;
  createdAt: string;
}

export function useChats() {
  return useQuery({
    queryKey: ["copilot-chats"],
    queryFn: () => apiFetch<ChatSummary[]>("/api/v1/copilot/chats"),
  });
}

export function useCreateChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ChatSummary>("/api/v1/copilot/chats", { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["copilot-chats"] }),
    onError: (err) => toast.error(err.message),
  });
}

export function useChatMessages(chatId: string | null) {
  return useQuery({
    queryKey: ["copilot-chat", chatId],
    queryFn: () => apiFetch<{ id: string; title: string; messages: ChatMessage[] }>(`/api/v1/copilot/chats/${chatId}`),
    enabled: !!chatId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, message }: { chatId: string; message: string }) =>
      apiFetch<{ content: string }>(`/api/v1/copilot/chats/${chatId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: (_data, { chatId }) => {
      void queryClient.invalidateQueries({ queryKey: ["copilot-chat", chatId] });
      void queryClient.invalidateQueries({ queryKey: ["copilot-chats"] });
    },
    onError: (err) => toast.error(err.message),
  });
}
