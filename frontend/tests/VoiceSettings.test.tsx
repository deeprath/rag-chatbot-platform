import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { VoiceSettings } from "../src/components/settings/VoiceSettings";

describe("VoiceSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to English and Natural (AI) voice", () => {
    render(<VoiceSettings />);
    expect(screen.getByRole("radio", { name: /english/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /natural \(ai\)/i })).toBeChecked();
  });

  it("disables the AI voice option once Hindi is selected, and switches to the device voice", async () => {
    const user = userEvent.setup();
    render(<VoiceSettings />);

    await user.click(screen.getByRole("radio", { name: /hindi/i }));

    expect(screen.getByRole("radio", { name: /natural \(ai\)/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /standard \(device voice\)/i })).toBeChecked();
  });

  it("toggles the auto-read-aloud preference", async () => {
    const user = userEvent.setup();
    render(<VoiceSettings />);

    const checkbox = screen.getByRole("checkbox", { name: /read assistant replies aloud/i });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(localStorage.getItem("rag-chatbot:auto-speak-replies")).toBe("true");
  });
});
