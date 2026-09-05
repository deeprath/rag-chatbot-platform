import { useCallback, useEffect, useState } from "react";

/**
 * Wraps the browser's native speechSynthesis (text-to-speech) — widely
 * supported (unlike SpeechRecognition), no network call, no API key.
 * Deliberately entirely client-side per the user's choice: message text
 * never leaves the browser just to be read aloud.
 */
export interface UseSpeechSynthesisResult {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string) => void;
  stop: () => void;
}

export function useSpeechSynthesis(): UseSpeechSynthesisResult {
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text.trim()) return;
      // Cancel whatever's already playing — otherwise utterances queue up
      // and read out back-to-back, which is never what "read this aloud" means.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [isSupported],
  );

  const stop = useCallback(() => {
    if (isSupported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  // Don't leave an utterance playing after navigating away from the chat page.
  useEffect(() => {
    return () => {
      if (isSupported) window.speechSynthesis.cancel();
    };
  }, [isSupported]);

  return { isSupported, isSpeaking, speak, stop };
}
