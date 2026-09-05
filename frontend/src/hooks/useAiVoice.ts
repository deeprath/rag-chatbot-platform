import { useCallback, useEffect, useRef, useState } from "react";

import { synthesizeSpeech, type AiVoice } from "../api/speech";

/**
 * Human-sounding AI voice via the backend (Groq's Orpheus model — see
 * backend/app/services/tts_service.py). English only for now. Always has a
 * real network round trip and a per-call cost, unlike the free/instant
 * browser voice (useSpeechSynthesis) — useVoiceOutput decides which one to
 * actually use and falls back to the browser voice if this fails.
 */
export interface UseAiVoiceResult {
  isLoading: boolean;
  isSpeaking: boolean;
  error: string | null;
  /** Resolves once playback finishes; rejects (with a readable message) on
   * any failure — missing key, unaccepted model terms, network error, etc. —
   * so a caller can catch it and fall back to another voice. */
  speak: (text: string, voice?: AiVoice) => Promise<void>;
  stop: () => void;
}

export function useAiVoice(): UseAiVoiceResult {
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  // Resolves whatever speak() call is currently in flight, cleared once it
  // settles. audio.pause() (what cleanup() does) does NOT fire onended or
  // onerror, so without this, calling stop() while an utterance is playing
  // left the caller's `await speak(...)` hanging forever — a real bug that
  // broke voice-conversation barge-in (interrupting the assistant mid-reply
  // never let the turn-taking state machine move on to the next turn).
  const resolvePendingRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onplay = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    // An explicit stop is a normal, successful end from the caller's point
    // of view (e.g. a barge-in interruption) — resolve, don't reject.
    resolvePendingRef.current?.();
    resolvePendingRef.current = null;
    cleanup();
    setIsSpeaking(false);
  }, [cleanup]);

  const speak = useCallback(
    async (text: string, voice?: AiVoice): Promise<void> => {
      stop(); // cancel + settle any previous in-flight utterance first
      setError(null);
      setIsLoading(true);
      let blob: Blob;
      try {
        blob = await synthesizeSpeech(text, voice);
      } catch (err) {
        const message = await readErrorMessage(err);
        setIsLoading(false);
        setError(message);
        throw new Error(message);
      }
      setIsLoading(false);

      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;

      return new Promise((resolve, reject) => {
        resolvePendingRef.current = resolve;
        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => {
          resolvePendingRef.current = null;
          setIsSpeaking(false);
          cleanup();
          resolve();
        };
        audio.onerror = () => {
          resolvePendingRef.current = null;
          setIsSpeaking(false);
          const message = "Playback failed.";
          setError(message);
          cleanup();
          reject(new Error(message));
        };
        void audio.play().catch((err: unknown) => {
          resolvePendingRef.current = null;
          setIsSpeaking(false);
          const message = err instanceof Error ? err.message : "Playback failed.";
          setError(message);
          cleanup();
          reject(new Error(message));
        });
      });
    },
    [cleanup, stop],
  );

  useEffect(() => stop, [stop]);

  return { isLoading, isSpeaking, error, speak, stop };
}

/** axios with `responseType: "blob"` means an error response body (our
 * backend's JSON {detail: "..."}) arrives as a Blob too, not parsed JSON —
 * has to be read and parsed by hand to get the real message back out. */
async function readErrorMessage(err: unknown): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (typeof parsed?.detail === "string") return parsed.detail;
    } catch {
      // fall through to the generic message below
    }
  }
  return err instanceof Error ? err.message : "AI voice failed.";
}
