import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { useSpeechSynthesis } = vi.hoisted(() => ({ useSpeechSynthesis: vi.fn() }));
vi.mock("../src/hooks/useSpeechSynthesis", () => ({ useSpeechSynthesis }));

import { MessageBubble } from "../src/components/chat/MessageBubble";

function mockSynthesis(overrides: Partial<ReturnType<typeof useSpeechSynthesis>> = {}) {
  useSpeechSynthesis.mockReturnValue({
    isSupported: true,
    isSpeaking: false,
    speak: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  });
}

describe("MessageBubble", () => {
  it("renders message content", () => {
    mockSynthesis();
    render(<MessageBubble role="assistant" content="Hello there" />);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("offers a read-aloud button for a finished assistant message", () => {
    mockSynthesis();
    render(<MessageBubble role="assistant" content="Hello there" />);
    expect(screen.getByRole("button", { name: /read message aloud/i })).toBeInTheDocument();
  });

  it("does not offer read-aloud for the user's own messages", () => {
    mockSynthesis();
    render(<MessageBubble role="user" content="What's up" />);
    expect(screen.queryByRole("button", { name: /read message aloud/i })).not.toBeInTheDocument();
  });

  it("does not offer read-aloud while the reply is still streaming", () => {
    mockSynthesis();
    render(<MessageBubble role="assistant" content="Still typ" pending />);
    expect(screen.queryByRole("button", { name: /read message aloud/i })).not.toBeInTheDocument();
  });

  it("does not offer read-aloud when speech synthesis isn't supported", () => {
    mockSynthesis({ isSupported: false });
    render(<MessageBubble role="assistant" content="Hello there" />);
    expect(screen.queryByRole("button", { name: /read message aloud/i })).not.toBeInTheDocument();
  });

  it("clicking the button speaks the message content", async () => {
    const speak = vi.fn();
    mockSynthesis({ speak });
    const user = userEvent.setup();
    render(<MessageBubble role="assistant" content="Hello there" />);

    await user.click(screen.getByRole("button", { name: /read message aloud/i }));
    expect(speak).toHaveBeenCalledWith("Hello there");
  });

  it("clicking again while speaking stops it instead", async () => {
    const stop = vi.fn();
    mockSynthesis({ isSpeaking: true, stop });
    const user = userEvent.setup();
    render(<MessageBubble role="assistant" content="Hello there" />);

    await user.click(screen.getByRole("button", { name: /stop reading aloud/i }));
    expect(stop).toHaveBeenCalledOnce();
  });
});
