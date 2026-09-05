import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { synthesizeSpeech } = vi.hoisted(() => ({ synthesizeSpeech: vi.fn() }));
vi.mock("../src/api/speech", () => ({ synthesizeSpeech, AI_VOICES: ["autumn"] }));

import { useAiVoice } from "../src/hooks/useAiVoice";

class FakeAudio {
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  src = "";
}

describe("useAiVoice", () => {
  let lastAudio: FakeAudio | undefined;

  beforeEach(() => {
    lastAudio = undefined;
    vi.stubGlobal(
      "Audio",
      vi.fn(() => {
        const instance = new FakeAudio();
        lastAudio = instance;
        return instance;
      }),
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fake-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("fetches audio, plays it, and resolves once playback ends", async () => {
    synthesizeSpeech.mockResolvedValue(new Blob(["fake"], { type: "audio/wav" }));
    const { result } = renderHook(() => useAiVoice());

    let settled = false;
    act(() => {
      void result.current.speak("Hello there").then(() => {
        settled = true;
      });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => lastAudio?.onplay?.());
    expect(result.current.isSpeaking).toBe(true);

    act(() => lastAudio?.onended?.());
    expect(result.current.isSpeaking).toBe(false);
    await waitFor(() => expect(settled).toBe(true));
  });

  it("surfaces the backend's error detail and rejects", async () => {
    const errorBlob = new Blob([JSON.stringify({ detail: "No Groq API key configured." })], {
      type: "application/json",
    });
    synthesizeSpeech.mockRejectedValue({ response: { data: errorBlob } });

    const { result } = renderHook(() => useAiVoice());
    await act(async () => {
      await expect(result.current.speak("Hello")).rejects.toThrow(
        "No Groq API key configured.",
      );
    });
    expect(result.current.error).toBe("No Groq API key configured.");
  });

  it("stop() pauses playback and resets isSpeaking", async () => {
    synthesizeSpeech.mockResolvedValue(new Blob(["fake"], { type: "audio/wav" }));
    const { result } = renderHook(() => useAiVoice());

    act(() => void result.current.speak("Hello there").catch(() => {}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => lastAudio?.onplay?.());

    act(() => result.current.stop());
    expect(lastAudio?.pause).toHaveBeenCalledOnce();
    expect(result.current.isSpeaking).toBe(false);
  });

  it("stop() settles the in-flight speak() promise instead of hanging forever", async () => {
    // Regression test: audio.pause() (what stop()'s cleanup does) never fires
    // onended/onerror on its own, so a caller awaiting speak() — e.g. a
    // barge-in interruption in useVoiceConversation — used to hang forever
    // when stop() was called mid-playback.
    synthesizeSpeech.mockResolvedValue(new Blob(["fake"], { type: "audio/wav" }));
    const { result } = renderHook(() => useAiVoice());

    let settled = false;
    act(() => {
      void result.current.speak("Hello there").then(() => {
        settled = true;
      });
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => lastAudio?.onplay?.());

    act(() => result.current.stop());

    await waitFor(() => expect(settled).toBe(true));
  });
});
