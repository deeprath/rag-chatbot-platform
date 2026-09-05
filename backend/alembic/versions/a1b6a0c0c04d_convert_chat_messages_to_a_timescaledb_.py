"""convert chat_messages to a timescaledb hypertable

Revision ID: a1b6a0c0c04d
Revises: d1010cebadc7
Create Date: 2026-09-04 21:48:11.842816

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b6a0c0c04d"
down_revision: str | Sequence[str] | None = "d1010cebadc7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Turn chat_messages into a hypertable partitioned on created_at (7-day chunks).

    This is why chat_messages has a composite (id, created_at) primary key instead of
    just id: Timescale requires the partitioning column to be part of every unique
    constraint on a hypertable. Query patterns (fetch a session's recent messages,
    time-range scans, eventual compression/retention policies) all key off created_at.
    """
    op.execute(
        "SELECT create_hypertable("
        "'chat_messages', 'created_at', "
        "chunk_time_interval => INTERVAL '7 days', "
        "if_not_exists => TRUE, "
        "migrate_data => TRUE)"
    )


def downgrade() -> None:
    # Timescale has no built-in "un-hypertable" operation short of recreating the
    # table and copying data across; deliberately not attempting that here. Drop
    # and recreate the table via the previous migration's downgrade if you need to
    # fully revert past this point.
    pass
