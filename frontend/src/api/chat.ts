import { apiClient } from "./client";
import type { ChatMessageRead, ChatSessionRead } from "./types";

export async function listSessions(): Promise<ChatSessionRead[]> {
  const { data } = await apiClient.get<ChatSessionRead[]>("/chat/sessions");
  return data;
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessageRead[]> {
  const { data } = await apiClient.get<ChatMessageRead[]>(
    `/chat/sessions/${sessionId}/messages`,
  );
  return data;
}
