import { useEffect, useState } from "react";

/** Only English and Hindi for now — English is the only language with an AI
 * voice option (see backend/app/services/tts_service.py); Hindi always uses
 * the browser's own voice. More languages can be added once there's an AI
 * voice worth offering for them. */
export type VoiceLanguage = "en" | "hi";
export type VoiceMode = "ai" | "browser";

export const BROWSER_LANG_TAG: Record<VoiceLanguage, string> = { en: "en-US", hi: "hi-IN" };
export const LANGUAGE_LABELS: Record<VoiceLanguage, string> = { en: "English", hi: "Hindi" };

const KEYS = {
  language: "rag-chatbot:voice-language",
  mode: "rag-chatbot:voice-mode",
  autoSpeak: "rag-chatbot:auto-speak-replies",
} as const;

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
  } catch {
    return fallback; // private browsing / storage blocked
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore — this is a convenience preference, not critical state.
  }
}

export interface UseVoicePreferencesResult {
  language: VoiceLanguage;
  setLanguage: (language: VoiceLanguage) => void;
  voiceMode: VoiceMode;
  setVoiceMode: (mode: VoiceMode) => void;
  autoSpeak: boolean;
  setAutoSpeak: (autoSpeak: boolean) => void;
}

/** Per-viewer voice settings, persisted in localStorage — not synced across
 * devices or sent to the backend. Shared by the Settings page (where these
 * are set) and useVoiceOutput/ChatPage (where they're read). */
export function useVoicePreferences(): UseVoicePreferencesResult {
  const [language, setLanguage] = useState<VoiceLanguage>(() =>
    readStored(KEYS.language, ["en", "hi"], "en"),
  );
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(() =>
    readStored(KEYS.mode, ["ai", "browser"], "ai"),
  );
  const [autoSpeak, setAutoSpeak] = useState<boolean>(
    () => readStored(KEYS.autoSpeak, ["true", "false"], "false") === "true",
  );

  useEffect(() => writeStored(KEYS.language, language), [language]);
  useEffect(() => writeStored(KEYS.mode, voiceMode), [voiceMode]);
  useEffect(() => writeStored(KEYS.autoSpeak, String(autoSpeak)), [autoSpeak]);

  return { language, setLanguage, voiceMode, setVoiceMode, autoSpeak, setAutoSpeak };
}
