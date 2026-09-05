import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useSpeechRecognition, useVoiceOutput, useVoicePreferences } = vi.hoisted(() => ({
  useSpeechRecognition: vi.fn(),
  useVoiceOutput: vi.fn(),
  useVoicePreferences: vi.fn(),
}));
vi.mock("../src/hooks/useSpeechRecognition", () => ({ useSpeechRecognition }));
vi.mock("../src/hooks/useVoiceOutput", () => ({ useVoiceOutput }));
vi.mock("../src/hooks/useVoicePreferences", () => ({
  useVoicePreferences,
  BROWSER_LANG_TAG: { en: "en-US", hi: "hi-IN" },
}));

import { useVoiceConversation } from "../src/hooks/useVoiceConversation";

describe("useVoiceConversation", () => {
  let recognitionState: { isListening: boolean; error: string | null };
  let recognitionStart: ReturnType<typeof vi.fn>;
  let recognitionStop: ReturnType<typeof vi.fn>;
  let capturedOnResult: ((transcript: string) => void) | undefined;
  let voiceOutputSpeak: ReturnType<typeof vi.fn>;
  let voiceOutputStop: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    recognitionState = { isListening: false, error: null };
    recognitionStart = vi.fn(() => {
      recognitionState = { ...recognitionState, isListening: true };
    });
    recognitionStop = vi.fn(() => {
      recognitionState = { ...recognitionState, isListening: false };
    });
    useSpeechRecognition.mockImplementation((onResult: (t: string) => void) => {
      capturedOnResult = onResult;
      return {
        isSupported: true,
        isListening: recognitionState.isListening,
        error: recognitionState.error,
        start: recognitionStart,
        stop: recognitionStop,
      };
    });

    voiceOutputSpeak = vi.fn().mockResolvedValue(undefined);
    voiceOutputStop = vi.fn();
    useVoiceOutput.mockReturnValue({
      isSupported: true,
      isLoading: false,
      isSpeaking: false,
      aiVoiceError: null,
      speak: voiceOutputSpeak,
      stop: voiceOutputStop,
    });

    useVoicePreferences.mockReturnValue({
      language: "en",
      setLanguage: vi.fn(),
      voiceMode: "browser",
      setVoiceMode: vi.fn(),
      autoSpeak: false,
      setAutoSpeak: vi.fn(),
    });
  });

  it("start() activates the conversation and begins listening", () => {
    const { result } = renderHook(() => useVoiceConversation(vi.fn()));
    act(() => result.current.start());

    expect(result.current.active).toBe(true);
    expect(result.current.phase).toBe("listening");
    expect(recognitionStart).toHaveBeenCalledOnce();
  });

  it("a final transcript moves to 'thinking', records it, and calls onUserMessage", () => {
    const onUserMessage = vi.fn();
    const { result } = renderHook(() => useVoiceConversation(onUserMessage));
    act(() => result.current.start());

    act(() => capturedOnResult?.("what's the weather"));

    expect(result.current.phase).toBe("thinking");
    expect(result.current.lastTranscript).toBe("what's the weather");
    expect(onUserMessage).toHaveBeenCalledWith("what's the weather");
  });

  it("handleAssistantReply speaks the reply, then resumes listening", async () => {
    const { result, rerender } = renderHook(() => useVoiceConversation(vi.fn()));
    act(() => result.current.start());
    act(() => capturedOnResult?.("hello"));
    // Recognition stops itself once it has produced a final result.
    act(() => {
      recognitionState = { ...recognitionState, isListening: false };
    });
    rerender();
    expect(result.current.phase).toBe("thinking");
    expect(recognitionStart).toHaveBeenCalledOnce(); // no restart while a turn is in flight

    await act(() => result.current.handleAssistantReply("Hi there!"));

    expect(voiceOutputSpeak).toHaveBeenCalledWith("Hi there!");
    expect(result.current.phase).toBe("listening");
    // The mic goes live again as soon as phase becomes "speaking" (barge-in
    // support), not only once the reply finishes — one more start() call.
    expect(recognitionStart).toHaveBeenCalledTimes(2);
  });

  it("a transcript heard while the assistant is speaking interrupts it (barge-in)", async () => {
    // A promise that stays pending until the test resolves it — models a
    // reply that's still audibly playing (unlike the resolved-immediately
    // mock elsewhere), so there's a real window to talk over it in.
    let resolveSpeak: (() => void) | undefined;
    voiceOutputSpeak.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSpeak = resolve;
        }),
    );

    const onUserMessage = vi.fn();
    const { result, rerender } = renderHook(() => useVoiceConversation(onUserMessage));
    act(() => result.current.start());
    act(() => capturedOnResult?.("first question"));
    act(() => {
      recognitionState = { ...recognitionState, isListening: false };
    });
    rerender();

    act(() => {
      void result.current.handleAssistantReply("a long reply the user talks over");
    });
    expect(result.current.phase).toBe("speaking");

    act(() => capturedOnResult?.("wait, stop"));

    expect(voiceOutputStop).toHaveBeenCalledOnce();
    expect(result.current.phase).toBe("thinking");
    expect(result.current.lastTranscript).toBe("wait, stop");
    expect(onUserMessage).toHaveBeenCalledWith("wait, stop");

    // The original (interrupted) speak() promise settling afterwards must
    // not stomp the phase the barge-in already advanced to.
    await act(async () => {
      resolveSpeak?.();
      await Promise.resolve();
    });
    expect(result.current.phase).toBe("thinking");
  });

  it("ignores a stray transcript while a turn is already in flight ('thinking')", () => {
    const onUserMessage = vi.fn();
    const { result } = renderHook(() => useVoiceConversation(onUserMessage));
    act(() => result.current.start());
    act(() => capturedOnResult?.("first"));
    expect(result.current.phase).toBe("thinking");

    act(() => capturedOnResult?.("second, arriving too soon"));

    expect(onUserMessage).toHaveBeenCalledOnce();
    expect(onUserMessage).toHaveBeenCalledWith("first");
  });

  it("handleAssistantReply is a no-op once the conversation has been stopped", async () => {
    const { result } = renderHook(() => useVoiceConversation(vi.fn()));
    act(() => result.current.start());
    act(() => result.current.stop());

    await act(() => result.current.handleAssistantReply("too late"));
    expect(voiceOutputSpeak).not.toHaveBeenCalled();
  });

  it("stop() deactivates, stops recognition, and stops any voice output", () => {
    const { result } = renderHook(() => useVoiceConversation(vi.fn()));
    act(() => result.current.start());

    act(() => result.current.stop());

    expect(result.current.active).toBe(false);
    expect(result.current.phase).toBe("idle");
    expect(recognitionStop).toHaveBeenCalledOnce();
    expect(voiceOutputStop).toHaveBeenCalledOnce();
  });

  it("auto-restarts listening after a silence timeout (no transcript heard)", () => {
    const { result, rerender } = renderHook(() => useVoiceConversation(vi.fn()));
    act(() => result.current.start());
    expect(recognitionStart).toHaveBeenCalledOnce();

    // Recognition timed out with nothing heard — isListening flips back to
    // false without a transcript ever arriving (phase stays "listening").
    act(() => {
      recognitionState = { ...recognitionState, isListening: false };
    });
    rerender();

    expect(recognitionStart).toHaveBeenCalledTimes(2);
  });

  it("does not auto-restart once a transcript has moved the phase to 'thinking'", () => {
    const { result, rerender } = renderHook(() => useVoiceConversation(vi.fn()));
    act(() => result.current.start());
    act(() => capturedOnResult?.("hello"));
    expect(result.current.phase).toBe("thinking");

    act(() => {
      recognitionState = { ...recognitionState, isListening: false };
    });
    rerender();

    // Still just the one initial start() — no restart while waiting on the reply.
    expect(recognitionStart).toHaveBeenCalledOnce();
  });

  it("a real recognition error ends the conversation instead of retry-looping", () => {
    const { result, rerender } = renderHook(() => useVoiceConversation(vi.fn()));
    act(() => result.current.start());

    act(() => {
      recognitionState = { ...recognitionState, error: "not-allowed" };
    });
    rerender();

    expect(result.current.active).toBe(false);
    expect(result.current.phase).toBe("idle");
  });
});
