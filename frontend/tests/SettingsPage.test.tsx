import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLLMSettings, updateLLMSettings } = vi.hoisted(() => ({
  getLLMSettings: vi.fn(),
  updateLLMSettings: vi.fn(),
}));

vi.mock("../src/api/settings", () => ({ getLLMSettings, updateLLMSettings }));

import { SettingsPage } from "../src/pages/SettingsPage";
import type { LLMSettingsRead } from "../src/api/types";

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// Full, valid LLMSettingsRead by default — individual tests override only
// the fields they care about, so adding a new field here doesn't require
// touching every test.
function settings(overrides: Partial<LLMSettingsRead> = {}): LLMSettingsRead {
  return {
    provider: "ollama",
    has_anthropic_key: false,
    has_openai_key: false,
    has_groq_key: false,
    anthropic_key_preview: null,
    openai_key_preview: null,
    groq_key_preview: null,
    ollama_available: true,
    ...overrides,
  };
}

describe("SettingsPage", () => {
  // Without this, mock.calls from an earlier test (e.g. its call index 0)
  // leak into a later test that also asserts on updateLLMSettings.mock.calls.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the heading and the current provider selected", async () => {
    getLLMSettings.mockResolvedValue(settings({ provider: "ollama" }));

    renderWithQueryClient(<SettingsPage />);

    expect(await screen.findByRole("heading", { name: /settings/i })).toBeInTheDocument();
    const ollamaRadio = await screen.findByRole("radio", { name: /ollama/i });
    expect(ollamaRadio).toBeChecked();
  });

  it("never renders a real saved API key, only the masked preview", async () => {
    getLLMSettings.mockResolvedValue(
      settings({
        provider: "anthropic",
        has_anthropic_key: true,
        anthropic_key_preview: "sk-ant-…a1b2",
      }),
    );

    renderWithQueryClient(<SettingsPage />);

    expect(await screen.findByText(/sk-ant-…a1b2/)).toBeInTheDocument();
    // The input for entering/replacing a key must start empty, never prefilled.
    const input = await screen.findByPlaceholderText(/leave blank to keep/i);
    expect(input).toHaveValue("");
    expect((input as HTMLInputElement).type).toBe("password");
  });

  it("requires a key before selecting a key-based provider for the first time", async () => {
    getLLMSettings.mockResolvedValue(settings({ provider: "ollama" }));

    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPage />);

    await user.click(await screen.findByRole("radio", { name: /anthropic/i }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/api key is required/i)).toBeInTheDocument();
    expect(updateLLMSettings).not.toHaveBeenCalled();
  });

  it("saves the provider + key and clears the input afterwards", async () => {
    getLLMSettings.mockResolvedValue(settings({ provider: "ollama" }));
    updateLLMSettings.mockResolvedValue(
      settings({
        provider: "anthropic",
        has_anthropic_key: true,
        anthropic_key_preview: "sk-ant-…z9y8",
      }),
    );

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

  it("saves a Groq key the same way as the other key-based providers", async () => {
    getLLMSettings.mockResolvedValue(settings({ provider: "ollama" }));
    updateLLMSettings.mockResolvedValue(
      settings({ provider: "groq", has_groq_key: true, groq_key_preview: "gsk-…c3d4" }),
    );

    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPage />);

    await user.click(await screen.findByRole("radio", { name: /groq/i }));
    const input = await screen.findByPlaceholderText(/sk-\.\.\./i);
    await user.type(input, "gsk-my-real-secret");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(updateLLMSettings.mock.calls[0][0]).toEqual({
        provider: "groq",
        api_key: "gsk-my-real-secret",
      }),
    );
  });

  it("disables Ollama and explains why when it isn't reachable", async () => {
    getLLMSettings.mockResolvedValue(
      settings({ provider: "anthropic", has_anthropic_key: true, ollama_available: false }),
    );

    renderWithQueryClient(<SettingsPage />);

    const ollamaRadio = await screen.findByRole("radio", { name: /ollama/i });
    expect(ollamaRadio).toBeDisabled();
    expect(await screen.findByText(/not running/i)).toBeInTheDocument();
  });

  it("shows a warning banner when Ollama is selected but no longer reachable", async () => {
    getLLMSettings.mockResolvedValue(settings({ provider: "ollama", ollama_available: false }));

    renderWithQueryClient(<SettingsPage />);

    expect(await screen.findByText(/isn't running right now/i)).toBeInTheDocument();
    expect(await screen.findByText(/make ollama-up/i)).toBeInTheDocument();
  });

  it("does not disable Ollama when it is reachable", async () => {
    getLLMSettings.mockResolvedValue(settings({ provider: "ollama", ollama_available: true }));

    renderWithQueryClient(<SettingsPage />);

    const ollamaRadio = await screen.findByRole("radio", { name: /ollama/i });
    expect(ollamaRadio).not.toBeDisabled();
    expect(screen.queryByText(/isn't running right now/i)).not.toBeInTheDocument();
  });
});
