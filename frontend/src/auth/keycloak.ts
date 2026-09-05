import Keycloak from "keycloak-js";

/**
 * Single shared Keycloak instance for the SPA, initialized via the
 * Authorization Code + PKCE flow (no client secret in the browser).
 */
export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
});

// keycloak-js throws if `.init()` is called more than once on the same instance.
// React 18 StrictMode deliberately double-invokes effects in development (mount
// -> cleanup -> mount), so AuthProvider's effect can run twice; memoizing the
// init promise here means the second run reuses it instead of re-initializing.
let initPromise: ReturnType<Keycloak["init"]> | null = null;

export function initKeycloakOnce(options: Parameters<Keycloak["init"]>[0]) {
  if (!initPromise) {
    initPromise = keycloak.init(options);
  }
  return initPromise;
}
