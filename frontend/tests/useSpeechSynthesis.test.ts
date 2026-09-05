import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSpeechSynthesis } from "../src/hooks/useSpeechSynthesis";

describe("useSpeechSynthesis", () => {
  let cancel: ReturnType<typeof vi.fn>;
  let speakSpy: ReturnType<typeof vi.fn>;
  let lastUtterance: SpeechSynthesisUtterance | undefined;

  beforeEach(() => {
    cancel = vi.fn();
    speakSpy = vi.fn((utterance: SpeechSynthesisUtterance) => {
      lastUtterance = utterance;
    });
    vi.stubGlobal("speechSynthesis", { cancel, speak: speakSpy });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
  });

  it("reports supported when speechSynthesis exists on window", () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.isSupported).toBe(true);
  });

  it("cancels any current utterance before speaking a new one", () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    act(() => result.current.speak("hello"));

    expect(cancel).toHaveBeenCalledOnce();
    expect(speakSpy).toHaveBeenCalledOnce();
    expect(lastUtterance?.text).toBe("hello");
  });

  it("does nothing for blank text", () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    act(() => result.current.speak("   "));
    expect(speakSpy).not.toHaveBeenCalled();
  });

  it("tracks isSpeaking across the utterance's start/end events", () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    act(() => result.current.speak("hello"));
    expect(result.current.isSpeaking).toBe(false); // not yet — onstart hasn't fired

    act(() => lastUtterance?.onstart?.());
    expect(result.current.isSpeaking).toBe(true);

    act(() => lastUtterance?.onend?.());
    expect(result.current.isSpeaking).toBe(false);
  });

  it("stop() cancels playback and resets isSpeaking", () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    act(() => result.current.speak("hello"));
    act(() => lastUtterance?.onstart?.());

    act(() => result.current.stop());
    expect(cancel).toHaveBeenCalledTimes(2); // once pre-emptively in speak(), once in stop()
    expect(result.current.isSpeaking).toBe(false);
  });
});
