"""AI text-to-speech via Groq's Orpheus TTS model — a natural, human-sounding
voice rather than the browser's synthetic `speechSynthesis` (see
frontend/src/hooks/useSpeechSynthesis.ts, which stays in use as an
always-available fallback and for languages this doesn't cover).

English only for now: `canopylabs/orpheus-v1-english` is the only
general-purpose voice model Groq hosts (there's also an Arabic one; no Hindi
model exists there — or, as far as we've found, anywhere with a free/already-
available key). The frontend's language picker only offers this for English
and falls back to the browser voice for Hindi. See docs/SECURITY.md.

**May need a one-time setup step, outside this codebase**: this model can
require accepting its terms in the Groq console before a given account's API
key can call it — tied to the account, not something a config value can do.
If that happens, Groq's response includes "terms" in its error message,
which we turn into a clear, actionable TTSError with the URL to accept them:
https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english

GROQ_TTS_VOICES and `response_format: "wav"` (Groq's *only* supported format
for this model — "mp3" is rejected outright) are both verified against a real
call, not guessed — an earlier "mp3" + a plausible-looking but wrong voice
list both failed against the live API before landing on these.
"""

import httpx

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

GROQ_TTS_MODEL = "canopylabs/orpheus-v1-english"
GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech"
TERMS_URL = "https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english"

# Verified against a real call (Groq's own "voice must be one of..." error
# message) — every one of these is a real, working Orpheus voice.
GROQ_TTS_VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"]
DEFAULT_VOICE = "autumn"


class TTSError(RuntimeError):
    """Speech synthesis couldn't be performed — an upstream Groq failure
    (unaccepted model terms, network error, or whatever else Groq rejects)."""


class TTSNotConfiguredError(TTSError):
    """The request itself can't be fulfilled regardless of Groq's state — no
    API key configured, or nothing to actually speak. Distinct from TTSError
    so the router can return 422 (fix your request/Settings) rather than 503
    (the external service is having a problem) for this case."""


async def synthesize_speech(
    text: str,
    *,
    api_key: str | None,
    voice: str = DEFAULT_VOICE,
    settings: Settings | None = None,
) -> tuple[bytes, str]:
    """Returns (audio_bytes, content_type). Raises TTSError on any failure —
    missing key, unaccepted terms, or whatever Groq itself rejects.
    """
    settings = settings or get_settings()
    if not api_key:
        raise TTSNotConfiguredError(
            "No Groq API key configured. Add one in Settings (or set GROQ_API_KEY) to use AI voice."
        )
    if not text.strip():
        raise TTSNotConfiguredError("Nothing to speak — the message text is empty.")

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.post(
                GROQ_TTS_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": GROQ_TTS_MODEL,
                    "input": text,
                    "voice": voice,
                    "response_format": "wav",
                },
            )
        except httpx.HTTPError as exc:
            raise TTSError(f"Could not reach Groq's speech API: {exc}") from exc

    if response.status_code >= 400:
        detail = _extract_error_message(response)
        if "terms" in detail.lower():
            raise TTSError(
                f"AI voice needs a one-time setup step: accept the model's terms at "
                f"{TERMS_URL}, then try again."
            )
        logger.warning("groq_tts_failed", status=response.status_code, detail=detail)
        raise TTSError(detail)

    content_type = response.headers.get("content-type", "audio/wav")
    return response.content, content_type


def _extract_error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
        return str(body.get("error", {}).get("message", response.text))
    except ValueError:
        return response.text
