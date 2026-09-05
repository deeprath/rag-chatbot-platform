import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getLLMSettings, updateLLMSettings } from "../api/settings";
import type { LLMProvider } from "../api/types";

const PROVIDERS: { value: LLMProvider; label: string; needsKey: boolean }[] = [
  { value: "ollama", label: "Ollama (local, no API key)", needsKey: false },
  { value: "anthropic", label: "Anthropic Claude", needsKey: true },
  { value: "openai", label: "OpenAI", needsKey: true },
];

function errorMessage(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail ?? (error instanceof Error ? error.message : "Something went wrong.");
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["llm-settings"], queryFn: getLLMSettings });

  const [provider, setProvider] = useState<LLMProvider | null>(null);
  // Never pre-filled from the server — the backend never sends a real key back
  // (see backend/app/api/v1/routers/llm_settings.py), only a masked preview.
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Only seed local state once, on first load — not on every refetch, or a
  // background refresh would silently discard whatever the user is mid-typing.
  useEffect(() => {
    if (settingsQuery.data && provider === null) {
      setProvider(settingsQuery.data.provider);
    }
  }, [settingsQuery.data, provider]);

  const mutation = useMutation({
    mutationFn: updateLLMSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(["llm-settings"], data);
      setApiKeyInput(""); // clear the field — never keep a submitted key sitting in state
      setSavedMessage("Saved.");
      setValidationError(null);
    },
  });

  if (settingsQuery.isLoading || provider === null) {
    return <p className="text-slate-400">Loading settings…</p>;
  }

  const data = settingsQuery.data;
  const selected = PROVIDERS.find((p) => p.value === provider)!;
  const hasKey =
    provider === "anthropic" ? data?.has_anthropic_key : provider === "openai" ? data?.has_openai_key : false;
  const keyPreview =
    provider === "anthropic"
      ? data?.anthropic_key_preview
      : provider === "openai"
        ? data?.openai_key_preview
        : null;

  function handleSave() {
    setSavedMessage(null);
    if (selected.needsKey && !hasKey && !apiKeyInput) {
      setValidationError(`An API key is required the first time you select ${selected.label}.`);
      return;
    }
    setValidationError(null);
    mutation.mutate({
      provider: provider!,
      ...(apiKeyInput ? { api_key: apiKeyInput } : {}),
    });
  }

  function handleClearKey() {
    setSavedMessage(null);
    mutation.mutate({ provider: provider!, clear_api_key: true });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-xl font-semibold text-slate-900">Settings</h1>
      <p className="mb-6 text-sm text-slate-500">
        Choose which model answers your chats. Ollama needs no API key; Anthropic and
        OpenAI need your own — it's encrypted before it's stored and is never shown
        again once saved.
      </p>

      <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-900">LLM provider</legend>
          {PROVIDERS.map((p) => (
            <label key={p.value} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="llm-provider"
                value={p.value}
                checked={provider === p.value}
                onChange={() => {
                  setProvider(p.value);
                  setApiKeyInput("");
                  setValidationError(null);
                  setSavedMessage(null);
                }}
              />
              {p.label}
            </label>
          ))}
        </fieldset>

        {selected.needsKey && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">
              {hasKey ? (
                <>
                  A key is saved ({keyPreview}).{" "}
                  <button
                    type="button"
                    onClick={handleClearKey}
                    disabled={mutation.isPending}
                    className="text-red-600 underline hover:text-red-700 disabled:opacity-50"
                  >
                    Remove it
                  </button>
                </>
              ) : (
                "No key saved yet."
              )}
            </p>
            <label className="block text-sm font-medium text-slate-900">
              {hasKey ? "Replace key" : "API key"}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={hasKey ? "Leave blank to keep the saved key" : "sk-..."}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
        )}

        {validationError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{validationError}</p>
        )}
        {mutation.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage(mutation.error)}
          </p>
        )}
        {savedMessage && !mutation.isError && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{savedMessage}</p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={mutation.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
