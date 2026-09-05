import pytest

from app.services.text_extraction import UnsupportedDocumentTypeError, extract_text


def test_extract_plain_text() -> None:
    result = extract_text(b"hello world", "text/plain")
    assert result == "hello world"


def test_extract_plain_text_replaces_invalid_utf8() -> None:
    result = extract_text(b"caf\xe9", "text/plain")  # invalid utf-8 byte
    assert "caf" in result


def test_extract_unsupported_type_raises() -> None:
    with pytest.raises(UnsupportedDocumentTypeError):
        extract_text(b"whatever", "application/zip")
