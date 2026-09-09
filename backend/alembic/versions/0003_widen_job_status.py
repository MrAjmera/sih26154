"""widen jobs.status to varchar(30) (completed_with_errors is 21 chars)

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("jobs", "status", type_=sa.String(30), existing_type=sa.String(20))


def downgrade() -> None:
    op.alter_column("jobs", "status", type_=sa.String(20), existing_type=sa.String(30))
