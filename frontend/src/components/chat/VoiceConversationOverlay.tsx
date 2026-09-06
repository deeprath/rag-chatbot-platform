import type { ConversationPhase } from "../../hooks/useVoiceConversation";

interface VoiceConversationOverlayProps {
  readonly phase: ConversationPhase;
  readonly error: string | null;
  readonly lastTranscript: string | null;
  readonly onStop: () => void;
}

const PHASE_TEXT: Record<ConversationPhase, string> = {
  idle: "",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

const ORB_COLOR: Record<ConversationPhase, string> = {
  idle: "bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-indigo-500/50",
  listening: "bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-indigo-500/50",
  thinking: "bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-700/50",
  speaking: "bg-gradient-to-br from-fuchsia-500 to-indigo-500 shadow-fuchsia-500/50",
};

const BAR_HEIGHTS = [14, 26, 34, 22, 30, 16];

/** The orb's center content for a given phase — a function rather than a
 * nested ternary (equalizer bars / thinking dots / idle mic, three distinct
 * JSX shapes, not just three strings) so each branch reads as its own case. */
function renderOrbContent(phase: ConversationPhase) {
  if (phase === "speaking") {
    return (
      <div className="flex h-9 items-center gap-1.5">
        {BAR_HEIGHTS.map((height, i) => (
          <span
            key={i}
            className="w-2 origin-center rounded-full bg-white/90 animate-voice-bar"
            style={{ height, animationDelay: `${i * 0.11}s` }}
          />
        ))}
      </div>
    );
  }
  if (phase === "thinking") {
    return (
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-3 w-3 rounded-full bg-white/85 animate-voice-dot"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    );
  }
  return <span className="text-5xl">🎙️</span>;
}

/**
 * Full-screen takeover shown while a voice conversation (useVoiceConversation)
 * is active — a single animated orb whose motion changes with the turn-taking
 * phase, so the screen visibly "looks like it's talking" rather than just
 * showing a status word: a soft breathing pulse while listening, a bouncing
 * equalizer while speaking, three thinking dots in between. Tap anywhere (or
 * the button) to stop — the assistant can be interrupted mid-reply just by
 * talking (see useVoiceConversation's barge-in support), so this is only for
 * ending the whole conversation, not for a single turn.
 */
export function VoiceConversationOverlay({
  phase,
  error,
  lastTranscript,
  onStop,
}: VoiceConversationOverlayProps) {
  const isListening = phase === "listening";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/97 backdrop-blur-sm">
      <button
        type="button"
        onClick={onStop}
        className="absolute right-6 top-6 rounded-full border border-slate-700 p-2 text-slate-400 hover:border-slate-500 hover:text-slate-200"
        aria-label="Stop voice conversation"
        title="Stop voice conversation"
      >
        ✕
      </button>

      <div className="relative flex h-64 w-64 items-center justify-center">
        {/* Expanding rings — only while actively listening, like ripples
            confirming the mic is really picking you up. */}
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-full bg-indigo-500/25 animate-voice-ring" />
            <span
              className="absolute inset-0 rounded-full bg-indigo-500/25 animate-voice-ring"
              style={{ animationDelay: "0.7s" }}
            />
            <span
              className="absolute inset-0 rounded-full bg-indigo-500/25 animate-voice-ring"
              style={{ animationDelay: "1.4s" }}
            />
          </>
        )}

        {/* Core orb */}
        <div
          className={`relative flex h-36 w-36 items-center justify-center rounded-full shadow-[0_0_60px_-10px] transition-colors duration-500 ${ORB_COLOR[phase]} ${isListening ? "animate-voice-breathe" : ""}`}
        >
          {renderOrbContent(phase)}
        </div>
      </div>

      <p className="mt-8 text-lg font-medium tracking-wide text-slate-100">{PHASE_TEXT[phase]}</p>

      <p className="mt-3 h-5 max-w-md truncate px-6 text-sm text-slate-400">
        {lastTranscript ? `You said: "${lastTranscript}"` : "Just start talking — no need to press anything."}
      </p>

      {error && (
        <p className="mt-2 max-w-md px-6 text-center text-sm text-red-400">
          Voice conversation error: {error}
        </p>
      )}

      <button
        type="button"
        onClick={onStop}
        className="mt-10 rounded-full border border-slate-600 bg-slate-800/80 px-6 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
      >
        ⏹️ Stop conversation
      </button>

      <p className="mt-3 text-xs text-slate-500">Talk anytime to interrupt — it's listening while it speaks.</p>
    </div>
  );
}
