import { useCallback, useEffect, useRef, useState } from "react";

import { useSpeechRecognition } from "./useSpeechRecognition";
import { useVoiceOutput } from "./useVoiceOutput";

export type ConversationPhase = "idle" | "listening" | "thinking" | "speaking";

export interface UseVoiceConversationResult {
  isSupported: boolean;
  active: boolean;
  phase: ConversationPhase;
  error: string | null;
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
 */
export function useVoiceConversation(
  onUserMessage: (transcript: string) => void,
): UseVoiceConversationResult {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<ConversationPhase>("idle");
  // Effects/callbacks below need the *current* value without re-subscribing
  // every time it changes (that would restart recognition mid-utterance).
  const activeRef = useRef(active);
  activeRef.current = active;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const voiceOutput = useVoiceOutput();
  const recognition = useSpeechRecognition((transcript) => {
    if (!transcript) return; // nothing understood — the effect below restarts listening
    setPhase("thinking");
    onUserMessage(transcript);
  });

  // Browser SpeechRecognition stops itself after each utterance *or* after a
  // silence timeout with nothing heard. Only the "nothing heard" case should
  // auto-restart listening here — if a transcript actually came through,
  // onResult above already advanced phase to "thinking" before this runs, so
  // the isListening/"listening" check correctly tells the two cases apart.
  useEffect(() => {
    if (!recognition.isListening && activeRef.current && phaseRef.current === "listening") {
      recognition.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only isListening should retrigger this
  }, [recognition.isListening]);

  // A real recognition error (mic permission denied, no mic at all, ...)
  // ends the conversation outright rather than retry-looping something that
  // will never succeed.
  useEffect(() => {
    if (recognition.error && activeRef.current) {
      setActive(false);
      setPhase("idle");
    }
  }, [recognition.error]);

  const start = useCallback(() => {
    setActive(true);
    setPhase("listening");
    recognition.start();
  }, [recognition]);

  const stop = useCallback(() => {
    setActive(false);
    setPhase("idle");
    recognition.stop();
    voiceOutput.stop();
  }, [recognition, voiceOutput]);

  const handleAssistantReply = useCallback(
    async (text: string) => {
      if (!activeRef.current) return;
      setPhase("speaking");
      try {
        await voiceOutput.speak(text);
      } catch {
        // Already surfaced via voiceOutput.aiVoiceError if it matters — the
        // conversation keeps going rather than stopping over a speech failure.
      }
      if (activeRef.current) {
        setPhase("listening");
        recognition.start();
      }
    },
    [voiceOutput, recognition],
  );

  return {
    isSupported: recognition.isSupported,
    active,
    phase,
    error: recognition.error,
    start,
    stop,
    handleAssistantReply,
  };
}
