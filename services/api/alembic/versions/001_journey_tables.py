"""Add journey-related tables: referral_rewards, journey_events, shareable_cards, user_notifications

Revision ID: 001_journey_tables
Revises: 
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '001_journey_tables'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # referral_rewards
    op.create_table(
        'referral_rewards',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('referral_id', UUID(as_uuid=True), sa.ForeignKey('referrals.id'), nullable=False),
        sa.Column('referrer_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('reward_type', sa.String(50), nullable=False),
        sa.Column('amount', sa.Numeric, nullable=False, server_default='0'),
        sa.Column('tx_hash', sa.String(66), nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # journey_events
    op.create_table(
        'journey_events',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('session_id', sa.String(100), nullable=True),
        sa.Column('runner_username', sa.String(100), nullable=True),
        sa.Column('phase', sa.String(50), nullable=False),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('metadata', sa.JSON, nullable=True),
        sa.Column('timestamp', sa.DateTime, server_default=sa.func.now()),
        sa.Column('duration_ms', sa.Integer, nullable=True),
    )

    # shareable_cards
    op.create_table(
        'shareable_cards',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('headline', sa.String(200), nullable=False),
        sa.Column('image_url', sa.Text, nullable=True),
        sa.Column('share_count', sa.Integer, server_default='0'),
        sa.Column('click_count', sa.Integer, server_default='0'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # user_notifications
    op.create_table(
        'user_notifications',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('message', sa.Text, nullable=False),
        sa.Column('urgency', sa.String(20), server_default='normal'),
        sa.Column('action_url', sa.Text, nullable=True),
        sa.Column('read', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('user_notifications')
    op.drop_table('shareable_cards')
    op.drop_table('journey_events')
    op.drop_table('referral_rewards')
