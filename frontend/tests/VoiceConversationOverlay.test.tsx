import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VoiceConversationOverlay } from "../src/components/chat/VoiceConversationOverlay";

describe("VoiceConversationOverlay", () => {
  it("shows the listening phase label and the default prompt", () => {
    render(
      <VoiceConversationOverlay
        phase="listening"
        error={null}
        lastTranscript={null}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText("Listening…")).toBeInTheDocument();
    expect(
      screen.getByText("Just start talking — no need to press anything."),
    ).toBeInTheDocument();
  });

  it("shows the thinking phase label", () => {
    render(
      <VoiceConversationOverlay
        phase="thinking"
        error={null}
        lastTranscript={null}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("shows the speaking phase label", () => {
    render(
      <VoiceConversationOverlay
        phase="speaking"
        error={null}
        lastTranscript={null}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText("Speaking…")).toBeInTheDocument();
  });

  it("shows the last heard transcript instead of the default prompt once there is one", () => {
    render(
      <VoiceConversationOverlay
        phase="thinking"
        error={null}
        lastTranscript="what's the weather"
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText(`You said: "what's the weather"`)).toBeInTheDocument();
    expect(
      screen.queryByText("Just start talking — no need to press anything."),
    ).not.toBeInTheDocument();
  });

  it("shows an error message when there is one", () => {
    render(
      <VoiceConversationOverlay
        phase="listening"
        error="not-allowed"
        lastTranscript={null}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText("Voice conversation error: not-allowed")).toBeInTheDocument();
  });

  it("does not show an error message when there isn't one", () => {
    render(
      <VoiceConversationOverlay
        phase="listening"
        error={null}
        lastTranscript={null}
        onStop={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Voice conversation error/)).not.toBeInTheDocument();
  });

  it("calls onStop from the corner button", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(
      <VoiceConversationOverlay
        phase="listening"
        error={null}
        lastTranscript={null}
        onStop={onStop}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stop voice conversation" }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("calls onStop from the bottom 'Stop conversation' button", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(
      <VoiceConversationOverlay
        phase="speaking"
        error={null}
        lastTranscript={null}
        onStop={onStop}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Stop conversation/ }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
