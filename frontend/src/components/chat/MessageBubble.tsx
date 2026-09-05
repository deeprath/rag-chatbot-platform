import type { MessageRole } from "../../api/types";

interface MessageBubbleProps {
  role: MessageRole;
  content: string;
  pending?: boolean;
}

export function MessageBubble({ role, content, pending }: MessageBubbleProps) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white text-slate-800"
        }`}
      >
        {content}
        {pending && <span className="ml-1 inline-block animate-pulse">▍</span>}
      </div>
    </div>
  );
}
