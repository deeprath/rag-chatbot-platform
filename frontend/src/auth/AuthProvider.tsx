import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { initKeycloakOnce, keycloak } from "./keycloak";

interface AuthContextValue {
  authenticated: boolean;
  initializing: boolean;
  token: string | undefined;
  username: string | undefined;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Bootstraps Keycloak (Authorization Code + PKCE), keeps the access token fresh,
 * and exposes auth state to the rest of the app via useAuth().
 */
export function AuthProvider({ children }: PropsWithChildren) {
  const [authenticated, setAuthenticated] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [token, setToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    initKeycloakOnce({
      onLoad: "check-sso",
      pkceMethod: "S256",
      // Deliberately NOT setting `silentCheckSsoRedirectUri`, and disabling
      // `checkLoginIframe`. Both features work by loading a hidden iframe and
      // waiting for it to postMessage back; keycloak-js unconditionally runs
      // that same iframe probe first if *either* option is set
      // (`loginIframe.enable || kc.silentCheckSsoRedirectUri`), and if the
      // browser blocks 3rd-party cookies/iframes (Safari by default,
      // Chrome/Brave increasingly, some ad blockers), the iframe never loads,
      // the probe times out, and `init()` REJECTS without ever processing a
      // pending login callback — leaving its `#state=...&code=...` fragment
      // stuck in the URL. A second login attempt then reuses that stale
      // fragment as its redirect_uri and Keycloak rejects it outright
      // ("Invalid parameter: redirect_uri") — this is what broke login.
      // Without either option, `check-sso` falls back to a plain top-level
      // `prompt=none` redirect to Keycloak on each unauthenticated load
      // (a visible round-trip instead of an invisible iframe) — slightly
      // less slick, but it never depends on 3rd-party iframes/cookies at all,
      // so it can't get stuck this way in any browser.
      checkLoginIframe: false,
    })
      .then((isAuthenticated) => {
        if (cancelled) return;
        setAuthenticated(isAuthenticated);
        setToken(keycloak.token);
        setInitializing(false);
      })
      .catch((err: unknown) => {
        console.error("Keycloak init failed", err);
        if (!cancelled) setInitializing(false);
      });

    // Proactively refresh the token before it expires; requests also refresh lazily.
    // Guarded on `keycloak.authenticated` — without it, this fires every 20s
    // even for a never-logged-in user, `updateToken` always rejects (there's
    // no token), and the `.catch` used to force a real login() redirect using
    // `window.location.href` as the default redirectUri. If a stale
    // `#state=...&code=...` fragment from an earlier, not-yet-processed
    // callback was still sitting in the URL at that moment, Keycloak rejects
    // it outright ("Invalid parameter: redirect_uri"). Only redirect for an
    // actually-expired *session* (was authenticated, refresh now fails), and
    // always pass a clean redirectUri so no stale fragment can leak into it.
    const refreshInterval = window.setInterval(() => {
      if (!keycloak.authenticated) return;
      keycloak
        .updateToken(30)
        .then((refreshed) => {
          if (refreshed) setToken(keycloak.token);
        })
        .catch(() =>
          keycloak.login({ redirectUri: window.location.origin + window.location.pathname }),
        );
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      authenticated,
      initializing,
      token,
      username: keycloak.tokenParsed?.preferred_username as string | undefined,
      // Always pass an explicit, clean redirectUri — never fall back to
      // keycloak-js's default of `window.location.href`, which can carry a
      // stale `#state=...&code=...` fragment left over from an earlier
      // unprocessed callback (see the long comment above).
      login: () => keycloak.login({ redirectUri: window.location.origin + window.location.pathname }),
      logout: () => keycloak.logout({ redirectUri: window.location.origin }),
    }),
    [authenticated, initializing, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
