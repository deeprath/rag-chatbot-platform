import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { useVoiceOutput } = vi.hoisted(() => ({ useVoiceOutput: vi.fn() }));
vi.mock("../src/hooks/useVoiceOutput", () => ({ useVoiceOutput }));

import { MessageBubble } from "../src/components/chat/MessageBubble";

function mockVoiceOutput(overrides: Partial<ReturnType<typeof useVoiceOutput>> = {}) {
  useVoiceOutput.mockReturnValue({
    isSupported: true,
    isLoading: false,
    isSpeaking: false,
    aiVoiceError: null,
    speak: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    ...overrides,
  });
}

describe("MessageBubble", () => {
  it("renders message content", () => {
    mockVoiceOutput();
    render(<MessageBubble role="assistant" content="Hello there" />);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("offers a read-aloud button for a finished assistant message", () => {
    mockVoiceOutput();
    render(<MessageBubble role="assistant" content="Hello there" />);
    expect(screen.getByRole("button", { name: /read message aloud/i })).toBeInTheDocument();
  });

  it("does not offer read-aloud for the user's own messages", () => {
    mockVoiceOutput();
    render(<MessageBubble role="user" content="What's up" />);
    expect(screen.queryByRole("button", { name: /read message aloud/i })).not.toBeInTheDocument();
  });

  it("does not offer read-aloud while the reply is still streaming", () => {
    mockVoiceOutput();
    render(<MessageBubble role="assistant" content="Still typ" pending />);
    expect(screen.queryByRole("button", { name: /read message aloud/i })).not.toBeInTheDocument();
  });

  it("does not offer read-aloud when no voice output is supported", () => {
    mockVoiceOutput({ isSupported: false });
    render(<MessageBubble role="assistant" content="Hello there" />);
    expect(screen.queryByRole("button", { name: /read message aloud/i })).not.toBeInTheDocument();
  });

  it("clicking the button speaks the message content", async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    mockVoiceOutput({ speak });
    const user = userEvent.setup();
    render(<MessageBubble role="assistant" content="Hello there" />);

    await user.click(screen.getByRole("button", { name: /read message aloud/i }));
    expect(speak).toHaveBeenCalledWith("Hello there");
  });

  it("clicking again while speaking stops it instead", async () => {
    const stop = vi.fn();
    mockVoiceOutput({ isSpeaking: true, stop });
    const user = userEvent.setup();
    render(<MessageBubble role="assistant" content="Hello there" />);

    await user.click(screen.getByRole("button", { name: /stop reading aloud/i }));
    expect(stop).toHaveBeenCalledOnce();
  });

  it("disables the button while a request for AI voice audio is in flight", () => {
    mockVoiceOutput({ isLoading: true });
    render(<MessageBubble role="assistant" content="Hello there" />);
    expect(screen.getByRole("button", { name: /read message aloud/i })).toBeDisabled();
  });
});
