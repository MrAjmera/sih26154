"""add context_analysis and error columns to jobs

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("context_analysis", postgresql.JSONB(), nullable=True))
    op.add_column("jobs", sa.Column("error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "error")
    op.drop_column("jobs", "context_analysis")
