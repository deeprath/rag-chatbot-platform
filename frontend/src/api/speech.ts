import { apiClient } from "./client";

/** Real, verified Orpheus voice names — see backend/app/services/tts_service.py
 * (GROQ_TTS_VOICES) for how these were confirmed against the live API. */
export const AI_VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"] as const;
export type AiVoice = (typeof AI_VOICES)[number];

export async function synthesizeSpeech(text: string, voice?: AiVoice): Promise<Blob> {
  const { data } = await apiClient.post<Blob>(
    "/speech/tts",
    { text, ...(voice ? { voice } : {}) },
    { responseType: "blob" },
  );
  return data;
}
