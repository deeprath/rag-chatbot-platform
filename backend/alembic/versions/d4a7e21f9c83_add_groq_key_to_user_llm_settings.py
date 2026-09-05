"""add groq key columns to user_llm_settings

Revision ID: d4a7e21f9c83
Revises: c3f8a9d21b47
Create Date: 2026-09-05 13:35:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4a7e21f9c83"
down_revision: str | Sequence[str] | None = "c3f8a9d21b47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("user_llm_settings", sa.Column("encrypted_groq_key", sa.Text(), nullable=True))
    op.add_column(
        "user_llm_settings", sa.Column("groq_key_preview", sa.String(length=32), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("user_llm_settings", "groq_key_preview")
    op.drop_column("user_llm_settings", "encrypted_groq_key")
