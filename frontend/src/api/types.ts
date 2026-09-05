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

export type LLMProvider = "anthropic" | "openai" | "ollama";

export interface LLMSettingsRead {
  provider: LLMProvider;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  anthropic_key_preview: string | null;
  openai_key_preview: string | null;
}

export interface LLMSettingsUpdate {
  provider: LLMProvider;
  // Only send when actually setting/replacing a key — omitting it (not
  // sending an empty string) keeps whatever was already saved server-side.
  api_key?: string;
  clear_api_key?: boolean;
}
