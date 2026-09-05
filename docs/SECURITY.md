# Security tooling

Four tools, each doing a different job, all actually run against this codebase
(not just configured) as of Phase 10 — every number and finding below is from
a real scan, not a description of what the tools are supposed to do.

## Gitleaks — secret scanning

Config: [`.gitleaks.toml`](../.gitleaks.toml) (extends the default ruleset, plus
a narrow allowlist for known-safe local-dev-only values like `minioadmin`).
Runs:
- Locally, on demand: `gitleaks detect --source . --no-git --config .gitleaks.toml`
- Automatically before every commit via [pre-commit](../.pre-commit-config.yaml)
  (`pre-commit install` once per clone)
- In CI on every push/PR: [`.github/workflows/security.yml`](../.github/workflows/security.yml)

Verified clean (0 leaks) against the full repo, and `pre-commit run --all-files`
passes all four configured hooks (gitleaks, ruff check, ruff format, eslint).

## Trivy — dependency, image, and IaC scanning

Three scan types, run separately because they answer different questions and
warrant different CI failure policies:

| Scan | Command | CI policy | Current result |
|---|---|---|---|
| Filesystem (our dependencies) | `trivy fs --severity HIGH,CRITICAL --ignorefile .trivyignore .` | **Blocks the build** | Clean |
| Image, `--pkg-types library` (our dependencies, inside the built image) | `trivy image --pkg-types library ...` | **Blocks the build** | Clean, both images |
| Image, full (+ base OS packages) | `trivy image ...` | Informational only | See below |
| Config/IaC (Dockerfiles, Helm templates) | `trivy config --severity HIGH,CRITICAL .` | Informational only | See below |

**Why library-only blocks but full-image doesn't**: our own dependencies are
something *we* choose and can fix immediately (bump a lockfile entry). Base
OS packages (Debian/Alpine packages pulled in by `python:3.12-slim` /
`nginxinc/nginx-unprivileged:alpine`) move on their own upstream patch
cadence — blocking every PR on a CVE we can't fix by editing this repo isn't
useful. The weekly scheduled run in `security.yml` re-scans unchanged code
specifically to catch when upstream *does* ship a fix.

**One documented exception** ([`.trivyignore`](../.trivyignore)):
`CVE-2024-23342` (`ecdsa`/Minerva timing side-channel) — a mandatory
transitive dependency of `python-jose` regardless of install extras, with no
upstream fix. Not reachable in this codebase: every `jwt.decode()` call
hardcodes `algorithms=["RS256"]` (RSA, never ECDSA) — see
[`app/core/security.py`](../backend/app/core/security.py).

**Current OS-package state** (informational, not blocking): the backend's
Debian trixie base currently has ~54 open HIGH/CRITICAL advisories (perl,
util-linux, ncurses — none invoked by our Python app) with no fix published
yet upstream at time of writing. The frontend's Alpine base is **fully clean**
(0 findings) after adding `apk --no-cache upgrade` to the Dockerfile — Alpine's
smaller, faster-moving package set had fixes available for all of them.

**Config/IaC**: down from 22 to 8 findings after adding `securityContext`
hardening to every workload — see
[`infra/helm/templates/_helpers.tpl`](../infra/helm/templates/_helpers.tpl)'s
`hardenedPodSecurityContext`/`restrictedContainerSecurityContext` comments for
exactly what's applied to which service and why (full hardening —
`runAsNonRoot`, `readOnlyRootFilesystem`, dropped capabilities — for the
backend/frontend images we control; a safer subset for third-party images
like Postgres/Keycloak whose entrypoints need root to start before dropping
privileges internally). The remaining 8 findings are that documented,
deliberate tradeoff, verified with real containers rather than assumed:
`docker run --read-only --tmpfs ... --user <uid>` was used to prove the
backend and frontend actually work under full hardening (including that the
HuggingFace embedding model cache write succeeds under a read-only root
filesystem) before committing to it.

## OWASP ZAP — dynamic scanning

[`infra/security/zap-scan.sh`](../infra/security/zap-scan.sh) runs two scans
against the live docker-compose stack:
1. **Baseline** (passive) against the frontend — security headers, cookies,
   information disclosure on the static SPA shell.
2. **API scan**, driven by the OpenAPI spec, against the backend (through
   Kong) — walks every documented endpoint. Runs unauthenticated, so it
   mainly proves public routes and the 401 boundary behave correctly rather
   than exercising authenticated business logic — wiring a Keycloak auth
   context into the scan for deeper coverage is a documented next step, not
   done here.

Run manually: `cd infra && docker compose up -d && ./infra/security/zap-scan.sh`.
In CI: the `zap` job in `security.yml`, on the weekly schedule or manual
dispatch only (not every PR — it needs the whole stack up, which is slow).

**Real findings caught and fixed** by actually running this against the live
stack (not just configuring it):
- Missing `X-Content-Type-Options` on API responses → added a small
  [security-headers middleware](../backend/app/core/middleware.py).
- Missing CSP, anti-clickjacking (`X-Frame-Options`), `Cross-Origin-*-Policy`
  headers, and a leaked nginx version on the frontend → added
  [`nginx.conf.template`](../frontend/nginx.conf.template) +
  [`security-headers.conf.template`](../frontend/security-headers.conf.template),
  including a real nginx gotcha: `add_header` in a location block *replaces*
  (doesn't merge with) headers inherited from its parent `server` block, so
  the `/assets/` and `/health` locations (which set their own
  `Cache-Control`/`Content-Type`) were silently losing every security header
  until each location explicitly re-`include`d them.
- CSP's `connect-src`/`frame-src` need different origins in docker-compose
  (Kong/Keycloak on different `localhost` ports) vs. the Helm chart's Ingress
  (Keycloak on an entirely different host) — solved via nginx's own
  `envsubst`-templating support (`/etc/nginx/templates/*.template`) rather
  than hand-rolling one, with `CSP_CONNECT_SRC` set per-environment in
  `infra/docker-compose.yml` / `infra/helm/templates/frontend/deployment.yaml`.

**Final state**: 0 FAIL, and the only remaining WARN-level finding is a
deliberate, documented choice (`style-src 'unsafe-inline'`, needed for
Tailwind/React's inline styles) — everything else is purely informational
(ZAP noting it detected an SPA, cache-control observations) or noise inherent
to any bundled JS file (numbers that incidentally look like Unix timestamps).

## Per-user API key encryption

Each user can pick their own LLM provider and paste in their own API key from
the frontend's Settings page ([`frontend/src/pages/SettingsPage.tsx`](../frontend/src/pages/SettingsPage.tsx))
instead of the whole deployment sharing one `LLM_PROVIDER`/key from `.env`.
That key is sensitive user data, so it gets the same "actually verify it,
don't just configure it" treatment as everything else here:

- **Encrypted before it ever reaches the database.** [`app/core/crypto.py`](../backend/app/core/crypto.py)
  uses Fernet (AES-128-CBC + HMAC, from `cryptography` — already a transitive
  dependency via `python-jose[cryptography]`, no new heavy dependency added)
  keyed by `SECRET_ENCRYPTION_KEY`, an app-level secret separate from any
  user's own key. [`test_crypto.py`](../backend/tests/unit/test_crypto.py)
  proves the stored ciphertext contains neither the plaintext nor a trivial
  encoding of it, and that a different key can't decrypt it.
- **Never decrypted to answer a GET.** The API (`GET /api/v1/settings/llm`)
  returns only a masked preview (`sk-ant-…a1b2`) computed once, at write time,
  from the plaintext the request already had in hand — stored in its own
  column, separate from the ciphertext — so displaying "a key is saved" never
  requires decrypting the real value again. The real key is decrypted in
  exactly one place, [`resolve_chat_model()`](../backend/app/services/llm_provider.py),
  transiently, immediately before it's handed to the provider's own SDK client
  for an actual chat call — never logged, never cached, never returned to the
  frontend. [`test_llm_settings_endpoint.py`](../backend/tests/integration/test_llm_settings_endpoint.py)
  asserts the plaintext appears in neither the HTTP response body nor the
  database row, end-to-end against a real (migrated) Postgres.
- **Scoped and authenticated like everything else.** The settings endpoints
  sit behind the same `get_current_owner_id` JWT dependency as documents/chat
  — one user can never see or overwrite another's key (verified by
  `test_settings_are_scoped_to_owner`).
- **Frontend hygiene**: the key `<input>` is `type="password"` with
  `autoComplete="new-password"` (discourages a password manager from
  offering to autofill it from an unrelated saved credential), is never
  pre-filled with a real value, and is cleared from component state
  immediately after a successful save.
- **Switching providers doesn't demand re-entering a key.** Anthropic,
  OpenAI, and Groq keys are stored in separate columns; toggling `provider`
  back and forth reuses whichever key was last saved for that provider
  rather than silently discarding it — but a key is required the *first*
  time a key-based provider is selected (`422` otherwise), and
  `clear_api_key` removes one explicitly.
- **Ollama can't be selected when it isn't actually reachable.** Unlike a
  missing API key (fixable right there in the form), a down local server
  isn't — so `PUT /settings/llm` live-checks it
  (`app/services/llm_provider.check_ollama_available`, 1.5s timeout) and
  rejects the selection with a clear next step (`make ollama-up`) rather than
  saving a choice that would just fail on the next chat message. The same
  check backs `ollama_available` on `GET`, which the frontend uses to grey
  the option out before you even try.

## SonarQube

[`sonar-project.properties`](../sonar-project.properties) covers both the
Python backend and TypeScript frontend as one project, wired to
`backend/coverage.xml` (`pytest --cov=app --cov-report=xml`, 90% coverage as
of Phase 9) and `frontend/coverage/lcov.info` (`npm run test:coverage`).

**Not run against a live server in this environment** — that needs an actual
SonarQube/SonarCloud instance and a token, which is a one-time setup a human
needs to do (create the project, generate `SONAR_TOKEN`, set it and
`SONAR_HOST_URL` as repo secrets, and set the `SONAR_ENABLED` repo variable to
`true` to turn on the CI job). The scanner config itself — source/test paths,
coverage report paths, exclusions — is written and the coverage reports it
needs are proven to generate correctly; only the server-side connection is
unverified here.

## Voice chat: no audio leaves the browser

Speech-to-text and text-to-speech (see
[`frontend/README.md`](../frontend/README.md#voice-chat)) use only the
browser's built-in `SpeechRecognition`/`speechSynthesis` APIs — deliberately,
so no recorded audio or transcript is ever sent to our backend or a
third-party speech API. The one caveat worth knowing: Chrome's own
`SpeechRecognition` implementation sends the captured audio to Google's
servers for recognition (that's how Chrome does it, not something this app
adds) — Firefox has no implementation at all, and Safari's is on-device.

## Local setup

```bash
brew install trivy gitleaks pre-commit   # or your platform's equivalent
pre-commit install                        # runs gitleaks + ruff + eslint on every commit
```
