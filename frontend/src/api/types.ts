export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

export interface DocumentRead {
  id: string;
  filename: string;
  mime_type: string;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
}

export type MessageRole = "user" | "assistant" | "system";

export interface ChatSessionRead {
  id: string;
  title: string | null;
  created_at: string;
}

export interface ChatMessageRead {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}
