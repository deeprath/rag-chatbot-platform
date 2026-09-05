"""create user_llm_settings

Revision ID: c3f8a9d21b47
Revises: a1b6a0c0c04d
Create Date: 2026-09-05 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3f8a9d21b47"
down_revision: str | Sequence[str] | None = "a1b6a0c0c04d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "user_llm_settings",
        sa.Column("owner_id", sa.String(length=255), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("encrypted_anthropic_key", sa.Text(), nullable=True),
        sa.Column("encrypted_openai_key", sa.Text(), nullable=True),
        sa.Column("anthropic_key_preview", sa.String(length=32), nullable=True),
        sa.Column("openai_key_preview", sa.String(length=32), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("owner_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("user_llm_settings")
