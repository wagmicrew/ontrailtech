"""Add aura tables: ancient_holders, aura_index, aura_contributions, influence_nodes, influence_edges

Revision ID: 002_aura_tables
Revises: 001_journey_tables
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '002_aura_tables'
down_revision = '001_journey_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ancient_holders
    op.create_table(
        'ancient_holders',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('wallet_address', sa.String(42), nullable=False),
        sa.Column('token_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('last_synced_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_ancient_holders_wallet_address', 'ancient_holders', ['wallet_address'], unique=True)

    # aura_index
    op.create_table(
        'aura_index',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('runner_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('total_aura', sa.Numeric, nullable=False, server_default='0'),
        sa.Column('weighted_aura', sa.Numeric, nullable=False, server_default='0'),
        sa.Column('ancient_supporter_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('aura_level', sa.String(20), nullable=False, server_default='None'),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_aura_index_runner_id', 'aura_index', ['runner_id'], unique=True)

    # aura_contributions
    op.create_table(
        'aura_contributions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('ancient_holder_id', UUID(as_uuid=True), sa.ForeignKey('ancient_holders.id'), nullable=False),
        sa.Column('runner_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('holder_weight', sa.Numeric, nullable=False),
        sa.Column('support_strength', sa.Numeric, nullable=False),
        sa.Column('contribution', sa.Numeric, nullable=False),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        'ix_aura_contributions_holder_runner',
        'aura_contributions',
        ['ancient_holder_id', 'runner_id'],
        unique=True,
    )

    # influence_nodes
    op.create_table(
        'influence_nodes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('reputation_score', sa.Numeric, nullable=False, server_default='0'),
        sa.Column('aura_score', sa.Numeric, nullable=False, server_default='0'),
        sa.Column('is_ancient', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_influence_nodes_user_id', 'influence_nodes', ['user_id'], unique=True)

    # influence_edges
    op.create_table(
        'influence_edges',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('from_user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('to_runner_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('edge_type', sa.String(20), nullable=False),
        sa.Column('weight', sa.Numeric, nullable=False, server_default='0'),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        'ix_influence_edges_from_to',
        'influence_edges',
        ['from_user_id', 'to_runner_id'],
    )


def downgrade() -> None:
    op.drop_table('influence_edges')
    op.drop_table('influence_nodes')
    op.drop_table('aura_contributions')
    op.drop_table('aura_index')
    op.drop_table('ancient_holders')
