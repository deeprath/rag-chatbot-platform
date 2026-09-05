import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wraps the browser's native SpeechRecognition (voice-to-text) — see
 * src/speech.d.ts for why the types are hand-declared. Only Chrome/Edge (and
 * Safari, partially) implement it; `isSupported` lets callers hide/disable
 * the mic button rather than have it silently fail everywhere else.
 *
 * Deliberately entirely client-side and provider-agnostic per the user's
 * choice: no audio or transcript ever goes through our backend.
 */
export interface UseSpeechRecognitionResult {
  isSupported: boolean;
  isListening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

// Errors a user causes just by not talking or by pressing stop — not real
// problems worth surfacing as an error message.
const IGNORED_ERRORS = new Set(["no-speech", "aborted"]);

export function useSpeechRecognition(
  onResult: (transcript: string) => void,
  /** BCP-47 tag (e.g. "hi-IN") to recognize in — defaults to the browser's
   * own language if omitted. Without this, recognition always listened in
   * whatever `navigator.language` was, ignoring the user's Hindi/English
   * choice on the Settings page — a real cause of "it didn't understand me"
   * for anyone whose browser language didn't match what they were speaking. */
  lang?: string,
): UseSpeechRecognitionResult {
  const RecognitionCtor =
    typeof window !== "undefined" ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : undefined;
  const isSupported = Boolean(RecognitionCtor);

  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Always call the *latest* onResult without re-creating start()/the
  // recognition instance every time the caller's callback identity changes.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const start = useCallback(() => {
    if (!RecognitionCtor || isListening) return;
    setError(null);

    const recognition = new RecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = lang || navigator.language || "en-US";

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (last?.isFinal) {
        onResultRef.current(last[0].transcript.trim());
      }
    };
    recognition.onerror = (event) => {
      if (!IGNORED_ERRORS.has(event.error)) setError(event.error);
    };
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [RecognitionCtor, isListening, lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // Abort (not just stop) on unmount — stop() still fires a final onresult
  // for whatever was captured so far, which we don't want after the
  // component using this hook is gone.
  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  return { isSupported, isListening, error, start, stop };
}
