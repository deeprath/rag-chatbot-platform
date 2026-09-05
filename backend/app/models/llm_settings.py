"""Per-user LLM provider choice + encrypted API keys.

One row per Keycloak user (`owner_id`, same identity used everywhere else —
documents, chat sessions). API keys are stored only as Fernet ciphertext (see
app/core/crypto.py) — this table never holds a plaintext key. Anthropic and
OpenAI keys are kept in separate columns (rather than one column that gets
overwritten) so switching `provider` back and forth doesn't make you re-enter
a key you already saved.
"""

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UpdatedAtMixin


class UserLLMSettings(Base, UpdatedAtMixin):
    __tablename__ = "user_llm_settings"

    owner_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    encrypted_anthropic_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_openai_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    # A short, non-reversible display string (e.g. "sk-ant-…a1b2"), computed
    # once at write time from the plaintext the request already had in hand.
    # Storing this separately means displaying "a key is saved, ending in
    # ...a1b2" never requires decrypting the real key again later — GET reads
    # these two columns only; encrypted_*_key is decrypted nowhere but
    # app/services/llm_provider.py, right before an actual provider API call.
    anthropic_key_preview: Mapped[str | None] = mapped_column(String(32), nullable=True)
    openai_key_preview: Mapped[str | None] = mapped_column(String(32), nullable=True)
