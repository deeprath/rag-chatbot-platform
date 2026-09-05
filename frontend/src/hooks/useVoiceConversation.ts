import { useCallback, useEffect, useRef, useState } from "react";

import { useSpeechRecognition } from "./useSpeechRecognition";
import { useVoiceOutput } from "./useVoiceOutput";
import { BROWSER_LANG_TAG, useVoicePreferences } from "./useVoicePreferences";

export type ConversationPhase = "idle" | "listening" | "thinking" | "speaking";

export interface UseVoiceConversationResult {
  isSupported: boolean;
  active: boolean;
  phase: ConversationPhase;
  error: string | null;
  /** The last thing recognized from the mic, for a "you said..." caption —
   * cleared at the start of every new turn. */
  lastTranscript: string | null;
  start: () => void;
  stop: () => void;
  /** Call once the assistant's reply for the current turn has fully arrived —
   * speaks it (AI voice, falling back to the browser voice — see
   * useVoiceOutput), then automatically resumes listening for the next turn.
   * A no-op if the conversation was stopped while the reply was streaming. */
  handleAssistantReply: (text: string) => Promise<void>;
}

/**
 * Hands-free, real-time voice chat: listen -> (on a pause, like a human
 * conversation) send what was heard -> speak the reply -> listen again,
 * looping until stopped. Built entirely from the existing pieces
 * (useSpeechRecognition, useVoiceOutput) — this hook is just the turn-taking
 * state machine wiring them together; ChatPage still owns actually sending
 * the message and knowing when a reply has fully arrived.
 *
 * Supports barge-in: the mic stays live during "speaking" too (not just
 * "listening"), so talking over the assistant's reply cuts it off and starts
 * the next turn immediately, like a real conversation — only "thinking" (a
 * turn is already in flight) and "idle" turn the mic off.
 */
export function useVoiceConversation(
  onUserMessage: (transcript: string) => void,
): UseVoiceConversationResult {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<ConversationPhase>("idle");
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  // Effects/callbacks below need the *current* value without re-subscribing
  // every time it changes (that would restart recognition mid-utterance).
  const activeRef = useRef(active);
  activeRef.current = active;
  // Mirrors `phase`, but — unlike a ref merely synced at the top of the
  // render body — is written synchronously by setPhaseNow() below at the
  // exact moment a transition is decided, not whenever React next gets
  // around to re-rendering. handleAssistantReply reads it right after
  // `await`ing voiceOutput.speak(): if that promise settles in the same
  // microtask turn (it can, e.g. when AI voice fails instantly), React may
  // not have re-rendered yet, so a ref that only updates on render would
  // still read the *previous* phase and wrongly think no barge-in happened.
  const phaseRef = useRef(phase);
  const setPhaseNow = useCallback((next: ConversationPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const { language } = useVoicePreferences();
  const voiceOutput = useVoiceOutput();
  const voiceOutputRef = useRef(voiceOutput);
  voiceOutputRef.current = voiceOutput;

  const recognition = useSpeechRecognition((transcript) => {
    if (!transcript) return; // nothing understood — the effect below restarts listening
    if (phaseRef.current === "thinking") return; // a turn is already in flight — ignore stray speech
    if (phaseRef.current === "speaking") {
      // Barge-in: the user started talking over the assistant's reply — cut
      // it off immediately rather than waiting for it to finish.
      voiceOutputRef.current.stop();
    }
    setLastTranscript(transcript);
    setPhaseNow("thinking");
    onUserMessage(transcript);
  }, BROWSER_LANG_TAG[language]);

  // Browser SpeechRecognition stops itself after each utterance *or* after a
  // silence timeout with nothing heard. This restarts it whenever that
  // happens and the mic should still be on — during "listening" (waiting for
  // a turn to start) and "speaking" (so a barge-in can be heard); "thinking"
  // (a turn already in flight) and "idle" deliberately leave it off.
  useEffect(() => {
    if (!recognition.isListening && activeRef.current && phaseRef.current !== "thinking") {
      recognition.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on either signal; refs carry the rest
  }, [recognition.isListening, phase]);

  // A real recognition error (mic permission denied, no mic at all, ...)
  // ends the conversation outright rather than retry-looping something that
  // will never succeed.
  useEffect(() => {
    if (recognition.error && activeRef.current) {
      setActive(false);
      setPhaseNow("idle");
    }
  }, [recognition.error, setPhaseNow]);

  const start = useCallback(() => {
    setActive(true);
    setPhaseNow("listening");
    setLastTranscript(null);
    recognition.start();
  }, [recognition, setPhaseNow]);

  const stop = useCallback(() => {
    setActive(false);
    setPhaseNow("idle");
    recognition.stop();
    voiceOutput.stop();
  }, [recognition, voiceOutput, setPhaseNow]);

  const handleAssistantReply = useCallback(
    async (text: string) => {
      if (!activeRef.current) return;
      setPhaseNow("speaking");
      try {
        await voiceOutput.speak(text);
      } catch {
        // Already surfaced via voiceOutput.aiVoiceError if it matters — the
        // conversation keeps going rather than stopping over a speech failure.
      }
      // Only fall back to "listening" if nothing has already moved the
      // conversation on — a barge-in mid-reply advances phase to "thinking"
      // itself (for the turn it just started), and this must not stomp on
      // that once the interrupted speak() promise above settles. Reading
      // phaseRef here (not the `phase` state variable) is what makes this
      // check race-proof — see setPhaseNow's comment above.
      if (activeRef.current && phaseRef.current === "speaking") {
        setPhaseNow("listening");
      }
    },
    [voiceOutput, setPhaseNow],
  );

  return {
    isSupported: recognition.isSupported,
    active,
    phase,
    error: recognition.error,
    lastTranscript,
    start,
    stop,
    handleAssistantReply,
  };
}
