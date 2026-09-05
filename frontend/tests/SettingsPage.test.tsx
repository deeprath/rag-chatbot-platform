import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const { getLLMSettings, updateLLMSettings } = vi.hoisted(() => ({
  getLLMSettings: vi.fn(),
  updateLLMSettings: vi.fn(),
}));

vi.mock("../src/api/settings", () => ({ getLLMSettings, updateLLMSettings }));

import { SettingsPage } from "../src/pages/SettingsPage";

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("SettingsPage", () => {
  it("renders the heading and the current provider selected", async () => {
    getLLMSettings.mockResolvedValue({
      provider: "ollama",
      has_anthropic_key: false,
      has_openai_key: false,
      anthropic_key_preview: null,
      openai_key_preview: null,
    });

    renderWithQueryClient(<SettingsPage />);

    expect(await screen.findByRole("heading", { name: /settings/i })).toBeInTheDocument();
    const ollamaRadio = await screen.findByRole("radio", { name: /ollama/i });
    expect(ollamaRadio).toBeChecked();
  });

  it("never renders a real saved API key, only the masked preview", async () => {
    getLLMSettings.mockResolvedValue({
      provider: "anthropic",
      has_anthropic_key: true,
      has_openai_key: false,
      anthropic_key_preview: "sk-ant-…a1b2",
      openai_key_preview: null,
    });

    renderWithQueryClient(<SettingsPage />);

    expect(await screen.findByText(/sk-ant-…a1b2/)).toBeInTheDocument();
    // The input for entering/replacing a key must start empty, never prefilled.
    const input = await screen.findByPlaceholderText(/leave blank to keep/i);
    expect(input).toHaveValue("");
    expect((input as HTMLInputElement).type).toBe("password");
  });

  it("requires a key before selecting a key-based provider for the first time", async () => {
    getLLMSettings.mockResolvedValue({
      provider: "ollama",
      has_anthropic_key: false,
      has_openai_key: false,
      anthropic_key_preview: null,
      openai_key_preview: null,
    });

    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPage />);

    await user.click(await screen.findByRole("radio", { name: /anthropic/i }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/api key is required/i)).toBeInTheDocument();
    expect(updateLLMSettings).not.toHaveBeenCalled();
  });

  it("saves the provider + key and clears the input afterwards", async () => {
    getLLMSettings.mockResolvedValue({
      provider: "ollama",
      has_anthropic_key: false,
      has_openai_key: false,
      anthropic_key_preview: null,
      openai_key_preview: null,
    });
    updateLLMSettings.mockResolvedValue({
      provider: "anthropic",
      has_anthropic_key: true,
      has_openai_key: false,
      anthropic_key_preview: "sk-ant-…z9y8",
      openai_key_preview: null,
    });

    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPage />);

    await user.click(await screen.findByRole("radio", { name: /anthropic/i }));
    const input = await screen.findByPlaceholderText(/sk-\.\.\./i);
    await user.type(input, "sk-ant-my-real-secret");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateLLMSettings).toHaveBeenCalled());
    // (TanStack Query v5 passes a second, internal context arg to mutationFn —
    // asserting on calls[0][0] avoids pinning the test to that implementation detail.)
    expect(updateLLMSettings.mock.calls[0][0]).toEqual({
      provider: "anthropic",
      api_key: "sk-ant-my-real-secret",
    });
    await waitFor(() => expect(input).toHaveValue(""));
  });
});
