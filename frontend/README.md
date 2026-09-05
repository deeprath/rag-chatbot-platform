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

Three pieces, each with its own fallback story:

- **Speech-to-text** (the composer's 🎤, and what drives "voice conversation"
  mode below): the browser's native `SpeechRecognition`/
  `webkitSpeechRecognition` — entirely client-side, nothing sent to our
  backend. **Needs Chrome/Edge** (and partially Safari) — Firefox doesn't
  implement it at all; `useSpeechRecognition` feature-detects this and
  disables the mic button (with a tooltip) rather than pretend it works
  everywhere.
- **Text-to-speech, "Standard (device)" mode**: the browser's native
  `speechSynthesis` — also entirely client-side, broadly supported (Chrome,
  Firefox, Safari, Edge). The only option for Hindi (see below).
- **Text-to-speech, "Natural (AI)" mode, English only**: a real backend call
  (`POST /api/v1/speech/tts`, see
  [`../backend/app/services/tts_service.py`](../backend/app/services/tts_service.py))
  to Groq's Orpheus model for an actually human-sounding voice, using either
  your own saved Groq key (Settings page) or the deployment's `GROQ_API_KEY`.
  `useVoiceOutput` picks this vs. the device voice based on the Settings
  page's choice, and **transparently falls back to the device voice** if the
  AI call fails for any reason (no key, network error, Groq's model needing
  a one-time terms-acceptance step in your Groq console — see
  `tts_service.py`'s module docstring) rather than going silent.

Both speech-to-text and speech-synthesis need a **secure context** —
`localhost` is fine for dev, but a real deployment needs HTTPS for the mic
(`SpeechRecognition.start()`) to work at all; browsers refuse microphone
access on plain HTTP for any non-localhost origin.

**Voice conversation mode** (`useVoiceConversation`, the chat page's "🎙️
Start voice conversation" button) chains the above into a hands-free loop:
listen → on a pause (same as a real conversation) send what was heard →
speak the reply → listen again — until you stop it. It's built entirely from
`useSpeechRecognition` + `useVoiceOutput`; the loop/turn-taking itself is
just a small state machine (`idle` → `listening` → `thinking` → `speaking` →
back to `listening`), no separate infrastructure.

Language, reply-voice mode, and the "read replies aloud automatically"
toggle are per-viewer `localStorage` preferences (`useVoicePreferences`), set
on the Settings page, read wherever something gets spoken — not synced
across devices or sent to the backend (the *choice* isn't; the actual reply
text is, whenever AI voice is used, since that's what gets synthesized).

## Structure

```
src/
  api/         axios client, per-resource API calls, the hand-rolled SSE client (sse.ts), speech.ts (AI voice)
  auth/        Keycloak (keycloak-js) integration — AuthProvider, useAuth()
  components/  Reusable UI (chat/, documents/, settings/, Layout)
  hooks/       Voice chat: useSpeechRecognition, useSpeechSynthesis, useAiVoice,
               useVoiceOutput (picks between the two + fallback), useVoicePreferences,
               useVoiceConversation (the hands-free conversation loop)
  pages/       Route-level components (ChatPage, DocumentsPage, SettingsPage)
```
