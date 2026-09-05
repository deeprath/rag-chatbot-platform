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

export type LLMProvider = "anthropic" | "openai" | "groq" | "ollama";

export interface LLMSettingsRead {
  provider: LLMProvider;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  has_groq_key: boolean;
  anthropic_key_preview: string | null;
  openai_key_preview: string | null;
  groq_key_preview: string | null;
  // Live-checked server-side — Ollama is optional/resource-heavy (see
  // infra/Makefile's `ollama-up`), so this reflects whether it's actually
  // running right now rather than assuming so.
  ollama_available: boolean;
}

export interface LLMSettingsUpdate {
  provider: LLMProvider;
  // Only send when actually setting/replacing a key — omitting it (not
  // sending an empty string) keeps whatever was already saved server-side.
  api_key?: string;
  clear_api_key?: boolean;
}
