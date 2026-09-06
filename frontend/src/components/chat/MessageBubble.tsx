import type { MessageRole } from "../../api/types";
import { useVoiceOutput } from "../../hooks/useVoiceOutput";

interface MessageBubbleProps {
  readonly role: MessageRole;
  readonly content: string;
  readonly pending?: boolean;
}

/** ⏳ while a fetch for AI-voice audio is in flight, ⏹️ once it's (or the
 * device voice is) actually playing, otherwise the idle 🔊 read-aloud icon —
 * a small function rather than a nested ternary so each state reads as its
 * own case. */
function readAloudIcon(isLoading: boolean, isSpeaking: boolean): string {
  if (isLoading) return "⏳";
  if (isSpeaking) return "⏹️";
  return "🔊";
}

export function MessageBubble({ role, content, pending }: MessageBubbleProps) {
  const isUser = role === "user";
  const { isSupported, isLoading, isSpeaking, speak, stop } = useVoiceOutput();
  // Only offer read-aloud once a reply has actually finished — reading a
  // still-streaming answer out loud would race the text being appended to.
  const canSpeak = !isUser && !pending && isSupported && content.trim().length > 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`group flex max-w-[75%] items-start gap-1.5 rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white text-slate-800"
        }`}
      >
        <span className="whitespace-pre-wrap">
          {content}
          {pending && <span className="ml-1 inline-block animate-pulse">▍</span>}
        </span>
        {canSpeak && (
          <button
            type="button"
            onClick={() => (isSpeaking ? stop() : void speak(content).catch(() => {}))}
            disabled={isLoading}
            title={isSpeaking ? "Stop reading aloud" : "Read aloud"}
            aria-label={isSpeaking ? "Stop reading aloud" : "Read message aloud"}
            className={`shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-wait ${
              isSpeaking ? "text-slate-900 opacity-100" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {readAloudIcon(isLoading, isSpeaking)}
          </button>
        )}
      </div>
    </div>
  );
}
