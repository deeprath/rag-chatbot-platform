import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useVoicePreferences } from "../src/hooks/useVoicePreferences";

describe("useVoicePreferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to English, AI voice, and auto-speak off", () => {
    const { result } = renderHook(() => useVoicePreferences());
    expect(result.current.language).toBe("en");
    expect(result.current.voiceMode).toBe("ai");
    expect(result.current.autoSpeak).toBe(false);
  });

  it("persists changes to localStorage and a fresh hook instance reads them back", () => {
    const { result } = renderHook(() => useVoicePreferences());
    act(() => {
      result.current.setLanguage("hi");
      result.current.setVoiceMode("browser");
      result.current.setAutoSpeak(true);
    });

    const { result: second } = renderHook(() => useVoicePreferences());
    expect(second.current.language).toBe("hi");
    expect(second.current.voiceMode).toBe("browser");
    expect(second.current.autoSpeak).toBe(true);
  });

  it("ignores a corrupted/unexpected stored value and falls back to the default", () => {
    localStorage.setItem("rag-chatbot:voice-language", "fr"); // not a supported language
    const { result } = renderHook(() => useVoicePreferences());
    expect(result.current.language).toBe("en");
  });
});
