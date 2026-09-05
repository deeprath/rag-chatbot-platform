import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAiVoice, useSpeechSynthesis, useVoicePreferences } = vi.hoisted(() => ({
  useAiVoice: vi.fn(),
  useSpeechSynthesis: vi.fn(),
  useVoicePreferences: vi.fn(),
}));
vi.mock("../src/hooks/useAiVoice", () => ({ useAiVoice }));
vi.mock("../src/hooks/useSpeechSynthesis", () => ({ useSpeechSynthesis }));
vi.mock("../src/hooks/useVoicePreferences", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useVoicePreferences,
}));

import { useVoiceOutput } from "../src/hooks/useVoiceOutput";

function mockAi(overrides: Partial<ReturnType<typeof useAiVoice>> = {}) {
  useAiVoice.mockReturnValue({
    isLoading: false,
    isSpeaking: false,
    error: null,
    speak: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    ...overrides,
  });
}

function mockBrowser(overrides: Partial<ReturnType<typeof useSpeechSynthesis>> = {}) {
  useSpeechSynthesis.mockReturnValue({
    isSupported: true,
    isSpeaking: false,
    speak: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    ...overrides,
  });
}

describe("useVoiceOutput", () => {
  beforeEach(() => {
    useVoicePreferences.mockReturnValue({ language: "en", voiceMode: "ai" });
  });

  it("uses AI voice when mode is ai and language is English", async () => {
    const aiSpeak = vi.fn().mockResolvedValue(undefined);
    mockAi({ speak: aiSpeak });
    const browserSpeak = vi.fn().mockResolvedValue(undefined);
    mockBrowser({ speak: browserSpeak });

    const { result } = renderHook(() => useVoiceOutput());
    await act(() => result.current.speak("Hello"));

    expect(aiSpeak).toHaveBeenCalledWith("Hello");
    expect(browserSpeak).not.toHaveBeenCalled();
  });

  it("falls back to the browser voice when AI voice fails", async () => {
    mockAi({ speak: vi.fn().mockRejectedValue(new Error("no key")), error: "no key" });
    const browserSpeak = vi.fn().mockResolvedValue(undefined);
    mockBrowser({ speak: browserSpeak });

    const { result } = renderHook(() => useVoiceOutput());
    await act(() => result.current.speak("Hello"));

    expect(browserSpeak).toHaveBeenCalledWith("Hello", "en-US");
    expect(result.current.aiVoiceError).toBe("no key");
  });

  it("uses the browser voice directly for Hindi, regardless of voiceMode", async () => {
    useVoicePreferences.mockReturnValue({ language: "hi", voiceMode: "ai" });
    const aiSpeak = vi.fn().mockResolvedValue(undefined);
    mockAi({ speak: aiSpeak });
    const browserSpeak = vi.fn().mockResolvedValue(undefined);
    mockBrowser({ speak: browserSpeak });

    const { result } = renderHook(() => useVoiceOutput());
    await act(() => result.current.speak("नमस्ते"));

    expect(aiSpeak).not.toHaveBeenCalled();
    expect(browserSpeak).toHaveBeenCalledWith("नमस्ते", "hi-IN");
  });

  it("uses the browser voice when the user picked 'browser' mode even for English", async () => {
    useVoicePreferences.mockReturnValue({ language: "en", voiceMode: "browser" });
    const aiSpeak = vi.fn().mockResolvedValue(undefined);
    mockAi({ speak: aiSpeak });
    const browserSpeak = vi.fn().mockResolvedValue(undefined);
    mockBrowser({ speak: browserSpeak });

    const { result } = renderHook(() => useVoiceOutput());
    await act(() => result.current.speak("Hello"));

    expect(aiSpeak).not.toHaveBeenCalled();
    expect(browserSpeak).toHaveBeenCalledWith("Hello", "en-US");
  });

  it("stop() stops both voice backends", () => {
    const aiStop = vi.fn();
    const browserStop = vi.fn();
    mockAi({ stop: aiStop });
    mockBrowser({ stop: browserStop });

    const { result } = renderHook(() => useVoiceOutput());
    act(() => result.current.stop());

    expect(aiStop).toHaveBeenCalledOnce();
    expect(browserStop).toHaveBeenCalledOnce();
  });
});
