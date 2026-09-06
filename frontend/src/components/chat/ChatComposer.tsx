import { useState } from "react";

import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";

interface ChatComposerProps {
  readonly disabled: boolean;
  readonly onSend: (message: string) => void;
}

export function ChatComposer({ disabled, onSend }: ChatComposerProps) {
  const [value, setValue] = useState("");

  // Fills the field rather than sending straight away — browser speech
  // recognition does mishear things, and this way there's always a chance to
  // read/edit before it's actually sent, same as typing.
  const { isSupported, isListening, error, start, stop } = useSpeechRecognition((transcript) => {
    if (!transcript) return;
    setValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
  });

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={isListening ? "Listening…" : "Ask a question about your documents…"}
          rows={1}
          className="max-h-40 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => (isListening ? stop() : start())}
          disabled={disabled || !isSupported}
          title={isSupported ? "Voice input" : "Voice input isn't supported in this browser"}
          aria-label={isListening ? "Stop voice input" : "Start voice input"}
          aria-pressed={isListening}
          className={`rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
            isListening
              ? "animate-pulse border-red-300 bg-red-50 text-red-600"
              : "border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {isListening ? "⏹️" : "🎤"}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={disabled || !value.trim()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-red-600">
          Voice input error: {error === "not-allowed" ? "microphone access was denied." : error}
        </p>
      )}
    </div>
  );
}
