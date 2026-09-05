"""Local, provider-agnostic embeddings (see docs/ARCHITECTURE.md for the rationale:
this is independent of whichever chat LLM_PROVIDER is active).
"""

from functools import lru_cache

from langchain_huggingface import HuggingFaceEmbeddings

from app.core.config import get_settings


@lru_cache
def get_embeddings() -> HuggingFaceEmbeddings:
    """Cached embeddings model. Loading it is expensive (downloads + loads
    weights the first time), so this must only happen once per process.
    """
    settings = get_settings()
    return HuggingFaceEmbeddings(
        model_name=settings.embedding_model_name,
        encode_kwargs={"normalize_embeddings": True},
    )


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of document chunks."""
    return get_embeddings().embed_documents(texts)


def embed_query(text: str) -> list[float]:
    """Embed a single query string (kept separate: some models use different
    prompting for queries vs. documents)."""
    return get_embeddings().embed_query(text)
