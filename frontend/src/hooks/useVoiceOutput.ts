import { useCallback } from "react";

import { useAiVoice } from "./useAiVoice";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import { BROWSER_LANG_TAG, useVoicePreferences } from "./useVoicePreferences";

export interface UseVoiceOutputResult {
  isSupported: boolean;
  isLoading: boolean;
  isSpeaking: boolean;
  /** Set only when AI voice was attempted and failed (and browser voice was
   * used instead) — informational, not blocking, since speak() still worked. */
  aiVoiceError: string | null;
  /** Resolves once playback (AI or browser, whichever ends up used) finishes. */
  speak: (text: string) => Promise<void>;
  stop: () => void;
}

/**
 * The single thing chat UI components call to "say this out loud" — decides
 * AI voice (English only, see useAiVoice) vs. the browser's own voice
 * (useSpeechSynthesis) based on the user's saved preference
 * (useVoicePreferences, set on the Settings page), and transparently falls
 * back to the browser voice if AI voice fails for any reason (no key, terms
 * not accepted, network error, ...) rather than going silent.
 */
export function useVoiceOutput(): UseVoiceOutputResult {
  const { language, voiceMode } = useVoicePreferences();
  const ai = useAiVoice();
  const browser = useSpeechSynthesis();

  const speak = useCallback(
    async (text: string) => {
      if (voiceMode === "ai" && language === "en") {
        try {
          await ai.speak(text);
          return;
        } catch {
          // ai.error is already set for display; fall through to the
          // browser voice so the user still hears *something*.
        }
      }
      await browser.speak(text, BROWSER_LANG_TAG[language]);
    },
    [voiceMode, language, ai, browser],
  );

  const stop = useCallback(() => {
    ai.stop();
    browser.stop();
  }, [ai, browser]);

  return {
    isSupported: browser.isSupported, // the AI voice + browser-fallback combo is always at least as available as the browser alone
    isLoading: ai.isLoading,
    isSpeaking: ai.isSpeaking || browser.isSpeaking,
    aiVoiceError: ai.error,
    speak,
    stop,
  };
}
