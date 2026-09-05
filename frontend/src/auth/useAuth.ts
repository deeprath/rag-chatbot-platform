import { createContext, useContext } from "react";

export interface AuthContextValue {
  authenticated: boolean;
  initializing: boolean;
  token: string | undefined;
  username: string | undefined;
  login: () => void;
  logout: () => void;
}

// Split out of AuthProvider.tsx so that file exports only the component —
// react-refresh/only-export-components (Vite Fast Refresh) requires a
// component file not export anything else, or an edit to it can't be
// hot-reloaded without a full page refresh.
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
