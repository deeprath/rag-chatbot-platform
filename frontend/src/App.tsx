import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/useAuth";
import { Layout } from "./components/Layout";
import { ChatPage } from "./pages/ChatPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { SettingsPage } from "./pages/SettingsPage";

function LoginGate({ children }: { children: React.ReactNode }) {
  const { authenticated, initializing, login } = useAuth();

  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-semibold text-slate-900">RAG Chatbot</h1>
        <button
          type="button"
          onClick={login}
          className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
        >
          Log in
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <LoginGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </LoginGate>
  );
}

export default App;
