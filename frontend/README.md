# RAG Chatbot Frontend

React + Vite + TypeScript chat UI. See [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
for the full system design.

## Local development

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev   # http://localhost:5173
```

Needs Kong (`http://localhost:8000`) and Keycloak (`http://localhost:8080`)
reachable — either the full `docker compose up -d` stack (see
[`../docs/SETUP.md`](../docs/SETUP.md)), or those two pieces running
standalone.

## Building

```bash
npm run build     # tsc -b && vite build -> dist/
npm run preview   # serve the production build locally
```

`VITE_*` env vars (API base URL, Keycloak URL/realm/client) are inlined into
the JS bundle at **build** time, not read at runtime — see
[`Dockerfile`](Dockerfile)'s comment. Rebuilding is required to point the app
at a different backend/Keycloak, which is why the Docker build takes them as
`--build-arg`s (see [`../infra/docker-compose.yml`](../infra/docker-compose.yml)
and [`../infra/helm/README.md`](../infra/helm/README.md) for the two
deployment targets' different values).

## Tests

```bash
npm run test            # vitest run
npm run test:watch      # vitest, watch mode
npm run test:coverage   # + lcov report (coverage/lcov.info), used by SonarQube
```

## Lint

```bash
npm run lint
```

## Voice chat

Speech-to-text (the composer's 🎤 button) and text-to-speech (each assistant
message's 🔊 button, plus a "Read replies aloud" toggle for automatic
playback) are both the browser's own native Web Speech API —
`SpeechRecognition`/`webkitSpeechRecognition` and `speechSynthesis`. No audio
or transcript is ever sent to our backend or any third party for this.

- **Speech-to-text needs Chrome/Edge** (and partially Safari) — Firefox
  doesn't implement `SpeechRecognition` at all. `useSpeechRecognition`
  feature-detects this and the composer disables the mic button (with a
  tooltip) rather than pretend it works everywhere.
- **Text-to-speech is broadly supported** (Chrome, Firefox, Safari, Edge) via
  `useSpeechSynthesis`.
- Both need a **secure context** — `localhost` is fine for dev, but a real
  deployment needs HTTPS for the mic (`SpeechRecognition.start()`) to work at
  all; browsers refuse microphone access on plain HTTP for any non-localhost
  origin.
- The "Read replies aloud" preference is a per-viewer `localStorage` value
  (`rag-chatbot:auto-speak-replies`), not synced across devices or sent to
  the backend — see `src/pages/ChatPage.tsx`.

## Structure

```
src/
  api/         axios client, per-resource API calls, the hand-rolled SSE client (sse.ts)
  auth/        Keycloak (keycloak-js) integration — AuthProvider, useAuth()
  components/  Reusable UI (chat/, documents/, Layout)
  hooks/       useSpeechRecognition / useSpeechSynthesis (voice chat, browser-native)
  pages/       Route-level components (ChatPage, DocumentsPage, SettingsPage)
```
