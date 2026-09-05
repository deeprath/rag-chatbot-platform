"""create timescaledb and vector extensions

Revision ID: 977cf9cdc495
Revises:
Create Date: 2026-09-04 21:47:16.870633

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "977cf9cdc495"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Enable the extensions the rest of the schema depends on:
    - timescaledb: for the chat_messages hypertable (see later migration)
    - vector (pgvector): for the document_chunks.embedding column
    """
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS vector")
    # Deliberately not dropping the timescaledb extension: doing so drops every
    # hypertable's Timescale-specific catalog state, which is rarely what you want
    # on a downgrade. Drop it manually if you really mean to.
