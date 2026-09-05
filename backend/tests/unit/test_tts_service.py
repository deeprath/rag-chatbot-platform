import httpx
import pytest

from app.services.tts_service import TTSError, TTSNotConfiguredError, synthesize_speech


def _fake_client(handler):
    class FakeAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    return FakeAsyncClient


async def test_no_api_key_raises_not_configured() -> None:
    with pytest.raises(TTSNotConfiguredError, match="No Groq API key"):
        await synthesize_speech("hello", api_key=None)


async def test_blank_text_raises_not_configured() -> None:
    with pytest.raises(TTSNotConfiguredError, match="Nothing to speak"):
        await synthesize_speech("   ", api_key="gsk-test")


async def test_success_returns_audio_bytes_and_content_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer gsk-test"
        return httpx.Response(
            200, content=b"fake-mp3-bytes", headers={"content-type": "audio/mpeg"}
        )

    monkeypatch.setattr(httpx, "AsyncClient", _fake_client(handler))

    audio, content_type = await synthesize_speech("Hello there", api_key="gsk-test")
    assert audio == b"fake-mp3-bytes"
    assert content_type == "audio/mpeg"


async def test_unaccepted_model_terms_surfaces_a_clear_actionable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400,
            json={
                "error": {
                    "message": "The model `canopylabs/orpheus-v1-english` requires terms "
                    "acceptance. Please have the org admin accept the terms at "
                    "https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english",
                    "type": "invalid_request_error",
                    "code": "model_terms_required",
                }
            },
        )

    monkeypatch.setattr(httpx, "AsyncClient", _fake_client(handler))

    with pytest.raises(TTSError, match="one-time setup step"):
        await synthesize_speech("Hello there", api_key="gsk-test")


async def test_other_groq_errors_pass_through_verbatim(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400, json={"error": {"message": "voice 'nonexistent' is not a valid voice"}}
        )

    monkeypatch.setattr(httpx, "AsyncClient", _fake_client(handler))

    with pytest.raises(TTSError, match="not a valid voice"):
        await synthesize_speech("Hello there", api_key="gsk-test", voice="nonexistent")


async def test_network_failure_raises_tts_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    monkeypatch.setattr(httpx, "AsyncClient", _fake_client(handler))

    with pytest.raises(TTSError, match="Could not reach"):
        await synthesize_speech("Hello there", api_key="gsk-test")
