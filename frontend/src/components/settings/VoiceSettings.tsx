import {
  LANGUAGE_LABELS,
  useVoicePreferences,
  type VoiceLanguage,
} from "../../hooks/useVoicePreferences";

const LANGUAGES = Object.keys(LANGUAGE_LABELS) as VoiceLanguage[];

/** Voice chat preferences — language, AI-vs-device reply voice, and
 * auto-read-aloud. Persisted per-viewer (localStorage), read by
 * useVoiceOutput/useVoiceConversation wherever a reply gets spoken. See
 * frontend/README.md#voice-chat. */
export function VoiceSettings() {
  const { language, setLanguage, voiceMode, setVoiceMode, autoSpeak, setAutoSpeak } =
    useVoicePreferences();

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-900">Voice</h2>
      <p className="text-xs text-slate-500">
        Speech-to-text (the composer's 🎤) and text-to-speech (each reply's 🔊, or
        the "Start voice conversation" button for hands-free chat) run in your
        browser. AI voice — a natural, human-sounding reply, not the robotic
        default — is available for English only; Hindi always uses your
        device's own voice.
      </p>

      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-slate-700">Language</legend>
        {LANGUAGES.map((lang) => (
          <label key={lang} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="voice-language"
              checked={language === lang}
              onChange={() => {
                setLanguage(lang);
                // AI voice only exists for English — fall back automatically
                // rather than leaving voiceMode pointed at something that
                // will just silently defer to the browser voice anyway.
                if (lang !== "en" && voiceMode === "ai") setVoiceMode("browser");
              }}
            />
            {LANGUAGE_LABELS[lang]}
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-1 border-t border-slate-100 pt-3">
        <legend className="text-xs font-medium text-slate-700">Reply voice</legend>
        <label
          className={`flex items-center gap-2 text-sm ${language === "en" ? "text-slate-700" : "text-slate-400"}`}
        >
          <input
            type="radio"
            name="voice-mode"
            checked={voiceMode === "ai"}
            disabled={language !== "en"}
            onChange={() => setVoiceMode("ai")}
          />
          Natural (AI){" "}
          {language !== "en" && <span className="text-xs">— English only</span>}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="voice-mode"
            checked={voiceMode === "browser"}
            onChange={() => setVoiceMode("browser")}
          />
          Standard (device voice)
        </label>
      </fieldset>

      <label className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={autoSpeak}
          onChange={(e) => setAutoSpeak(e.target.checked)}
        />
        Read assistant replies aloud automatically
      </label>
    </div>
  );
}
