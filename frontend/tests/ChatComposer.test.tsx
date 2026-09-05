import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { useSpeechRecognition } = vi.hoisted(() => ({ useSpeechRecognition: vi.fn() }));
vi.mock("../src/hooks/useSpeechRecognition", () => ({ useSpeechRecognition }));

import { ChatComposer } from "../src/components/chat/ChatComposer";

function mockRecognition(overrides: Partial<ReturnType<typeof useSpeechRecognition>> = {}) {
  useSpeechRecognition.mockReturnValue({
    isSupported: true,
    isListening: false,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  });
}

describe("ChatComposer", () => {
  it("sends the trimmed message and clears the field", async () => {
    mockRecognition();
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer disabled={false} onSend={onSend} />);

    const textbox = screen.getByPlaceholderText(/ask a question/i);
    await user.type(textbox, "  hello there  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("hello there");
    expect(textbox).toHaveValue("");
  });

  it("hides/disables the mic button when voice input isn't supported", () => {
    mockRecognition({ isSupported: false });
    render(<ChatComposer disabled={false} onSend={vi.fn()} />);

    expect(screen.getByRole("button", { name: /voice input/i })).toBeDisabled();
  });

  it("starts voice input on click and shows a listening state", async () => {
    const start = vi.fn();
    mockRecognition({ start });
    const user = userEvent.setup();
    render(<ChatComposer disabled={false} onSend={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /start voice input/i }));
    expect(start).toHaveBeenCalledOnce();
  });

  it("stops voice input when already listening", async () => {
    const stop = vi.fn();
    mockRecognition({ isListening: true, stop });
    const user = userEvent.setup();
    render(<ChatComposer disabled={false} onSend={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /stop voice input/i }));
    expect(stop).toHaveBeenCalledOnce();
  });

  it("shows a recognition error", () => {
    mockRecognition({ error: "not-allowed" });
    render(<ChatComposer disabled={false} onSend={vi.fn()} />);
    expect(screen.getByText(/microphone access was denied/i)).toBeInTheDocument();
  });

  it("appends a voice transcript to any text already typed", async () => {
    let onResultCallback: ((transcript: string) => void) | undefined;
    useSpeechRecognition.mockImplementation((onResult: (t: string) => void) => {
      onResultCallback = onResult;
      return { isSupported: true, isListening: false, error: null, start: vi.fn(), stop: vi.fn() };
    });
    const user = userEvent.setup();
    render(<ChatComposer disabled={false} onSend={vi.fn()} />);

    const textbox = screen.getByPlaceholderText(/ask a question/i);
    await user.type(textbox, "typed text");
    act(() => onResultCallback?.("spoken text"));

    expect(textbox).toHaveValue("typed text spoken text");
  });
});
