import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
  }`;

export function Layout() {
  const { username, logout } = useAuth();

  return (
    <div className="flex h-full min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold text-slate-900">RAG Chatbot</span>
          <nav className="flex gap-1">
            <NavLink to="/chat" className={navLinkClass}>
              Chat
            </NavLink>
            <NavLink to="/documents" className={navLinkClass}>
              Documents
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              Settings
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-600">
          {username && <span>{username}</span>}
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
