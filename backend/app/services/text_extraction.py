"""Extract plain text from an uploaded file's raw bytes, by MIME type."""

import io

import docx2txt
from pypdf import PdfReader

SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
}


class UnsupportedDocumentTypeError(ValueError):
    pass


def extract_text(data: bytes, mime_type: str) -> str:
    if mime_type == "application/pdf":
        return _extract_pdf(data)
    if mime_type == "text/plain":
        return data.decode("utf-8", errors="replace")
    if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _extract_docx(data)
    raise UnsupportedDocumentTypeError(
        f"Unsupported document type {mime_type!r}. Supported: {sorted(SUPPORTED_MIME_TYPES)}"
    )


def _extract_pdf(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    return "\n\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_docx(data: bytes) -> str:
    return docx2txt.process(io.BytesIO(data)) or ""
