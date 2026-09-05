import { apiClient } from "./client";
import type { LLMSettingsRead, LLMSettingsUpdate } from "./types";

export async function getLLMSettings(): Promise<LLMSettingsRead> {
  const { data } = await apiClient.get<LLMSettingsRead>("/settings/llm");
  return data;
}

export async function updateLLMSettings(payload: LLMSettingsUpdate): Promise<LLMSettingsRead> {
  const { data } = await apiClient.put<LLMSettingsRead>("/settings/llm", payload);
  return data;
}
