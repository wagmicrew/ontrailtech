"""Seed default aura configuration keys into admin_config

Revision ID: 003_seed_aura_config
Revises: 002_aura_tables
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '003_seed_aura_config'
down_revision = '002_aura_tables'
branch_labels = None
depends_on = None

# Reference to the existing admin_config table for bulk_insert
admin_config = sa.table(
    'admin_config',
    sa.column('id', UUID(as_uuid=True)),
    sa.column('config_key', sa.String),
    sa.column('config_value', sa.JSON),
    sa.column('updated_by', UUID(as_uuid=True)),
    sa.column('updated_at', sa.DateTime),
)

AURA_DEFAULTS = [
    {"config_key": "nft_multiplier", "config_value": {"value": 1.0}},
    {"config_key": "aura_boost_factor", "config_value": {"value": 0.1}},
    {"config_key": "max_aura_boost", "config_value": {"value": 0.5}},
    {"config_key": "max_aura_multiplier", "config_value": {"value": 1.0}},
    {"config_key": "max_aura_factor", "config_value": {"value": 0.5}},
    {"config_key": "ancient_multiplier", "config_value": {"value": 1.2}},
    {"config_key": "min_reputation_threshold", "config_value": {"value": 1.0}},
    {"config_key": "max_contribution_percentile", "config_value": {"value": 95}},
]


def upgrade() -> None:
    op.bulk_insert(admin_config, AURA_DEFAULTS)


def downgrade() -> None:
    keys = [row["config_key"] for row in AURA_DEFAULTS]
    op.execute(
        admin_config.delete().where(admin_config.c.config_key.in_(keys))
    )
