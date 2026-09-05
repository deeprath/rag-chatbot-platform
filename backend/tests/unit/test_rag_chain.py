from langchain_core.language_models.fake_chat_models import FakeListChatModel

from app.langchain_pipeline.rag_chain import format_context, stream_answer


def test_format_context_empty() -> None:
    assert "no relevant documents" in format_context([])


def test_format_context_joins_chunks() -> None:
    result = format_context(["chunk one", "chunk two"])
    assert "chunk one" in result
    assert "chunk two" in result


async def test_stream_answer_yields_full_response() -> None:
    fake_model = FakeListChatModel(responses=["This is the answer."])

    tokens = [
        token
        async for token in stream_answer(
            fake_model,
            {"context": "some context", "history": [], "question": "What is this about?"},
        )
    ]

    assert "".join(tokens) == "This is the answer."
