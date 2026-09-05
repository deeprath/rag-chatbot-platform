import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSpeechRecognition } from "../src/hooks/useSpeechRecognition";

/** A minimal fake SpeechRecognition the hook can drive, with helpers to
 * fire its events the way a real browser implementation would. */
class FakeSpeechRecognition implements SpeechRecognitionLike {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn(() => true);

  emitFinalResult(transcript: string) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript } } },
    } as unknown as SpeechRecognitionEventLike);
  }

  emitError(error: string) {
    this.onerror?.({ error } as SpeechRecognitionErrorEventLike);
  }

  emitEnd() {
    this.onend?.();
  }
}

describe("useSpeechRecognition", () => {
  let lastInstance: FakeSpeechRecognition | undefined;

  beforeEach(() => {
    lastInstance = undefined;
    window.SpeechRecognition = vi.fn(() => {
      lastInstance = new FakeSpeechRecognition();
      return lastInstance;
    }) as unknown as typeof window.SpeechRecognition;
  });

  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });

  it("reports unsupported when no browser implementation exists", () => {
    delete window.SpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition(vi.fn()));
    expect(result.current.isSupported).toBe(false);
  });

  it("starts listening and calls onResult with the final transcript", () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(onResult));

    expect(result.current.isSupported).toBe(true);
    act(() => result.current.start());

    expect(result.current.isListening).toBe(true);
    expect(lastInstance?.start).toHaveBeenCalledOnce();

    act(() => lastInstance!.emitFinalResult("hello world"));
    expect(onResult).toHaveBeenCalledWith("hello world");
  });

  it("clears isListening when recognition ends", () => {
    const { result } = renderHook(() => useSpeechRecognition(vi.fn()));
    act(() => result.current.start());
    act(() => lastInstance!.emitEnd());
    expect(result.current.isListening).toBe(false);
  });

  it("ignores no-speech and aborted errors, but surfaces real ones", () => {
    const { result } = renderHook(() => useSpeechRecognition(vi.fn()));
    act(() => result.current.start());

    act(() => lastInstance!.emitError("no-speech"));
    expect(result.current.error).toBeNull();

    act(() => lastInstance!.emitError("not-allowed"));
    expect(result.current.error).toBe("not-allowed");
  });

  it("stop() calls the underlying recognition's stop()", () => {
    const { result } = renderHook(() => useSpeechRecognition(vi.fn()));
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(lastInstance?.stop).toHaveBeenCalledOnce();
  });
});
