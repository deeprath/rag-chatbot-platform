import type { ChatSessionRead } from "../../api/types";

function formatSessionLabel(session: ChatSessionRead): string {
  if (session.title) return session.title;
  const date = new Date(session.created_at);
  return `Chat · ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

interface SessionSidebarProps {
  readonly sessions: ChatSessionRead[];
  readonly selectedSessionId: string | null;
  readonly onSelect: (sessionId: string) => void;
  readonly onNewChat: () => void;
}

export function SessionSidebar({
  sessions,
  selectedSessionId,
  onSelect,
  onNewChat,
}: SessionSidebarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New chat
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {sessions.length === 0 && (
          <p className="px-2 py-4 text-sm text-slate-400">No conversations yet.</p>
        )}
        <ul className="space-y-1">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onSelect(session.id)}
                className={`w-full truncate rounded-md px-2 py-2 text-left text-sm ${
                  session.id === selectedSessionId
                    ? "bg-slate-100 font-medium text-slate-900"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                title={formatSessionLabel(session)}
              >
                {formatSessionLabel(session)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
