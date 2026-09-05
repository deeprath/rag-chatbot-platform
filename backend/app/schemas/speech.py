from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4096)
    # Optional — defaults to tts_service.DEFAULT_VOICE. Not a closed enum:
    # see tts_service's module docstring for why the voice list isn't
    # enforced as a hard allowlist here.
    voice: str | None = None
