"""Add Friend-Fi and POI-Fi tables

Revision ID: 007_friendfi_poifi_tables
Revises: 006_avatar_url_text
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '007_friendfi_poifi_tables'
down_revision = '006_avatar_url_text'
branch_labels = None
depends_on = None


def upgrade():
    # ── friend_pass_holdings ──
    op.create_table(
        'friend_pass_holdings',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('owner_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('runner_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('passes', sa.Integer, nullable=False, server_default='1'),
        sa.Column('purchase_price_eth', sa.Numeric, nullable=False),
        sa.Column('sold', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('sale_price_eth', sa.Numeric, nullable=True),
        sa.Column('sold_at', sa.DateTime, nullable=True),
        sa.Column('purchased_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_friend_pass_holdings_owner_runner', 'friend_pass_holdings', ['owner_id', 'runner_id'])

    # ── poi_listings ──
    op.create_table(
        'poi_listings',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('poi_id', UUID(as_uuid=True), sa.ForeignKey('pois.id'), nullable=False),
        sa.Column('seller_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('price_eth', sa.Numeric, nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('buyer_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('sold_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_poi_listings_poi_id', 'poi_listings', ['poi_id'])

    # ── poi_rewards ──
    op.create_table(
        'poi_rewards',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('poi_id', UUID(as_uuid=True), sa.ForeignKey('pois.id'), nullable=False),
        sa.Column('owner_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('visitor_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('checkin_id', UUID(as_uuid=True), sa.ForeignKey('checkins.id'), nullable=False),
        sa.Column('reward_amount_eth', sa.Numeric, nullable=False, server_default='0.0001'),
        sa.Column('claimed', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('claimed_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_poi_rewards_poi_id', 'poi_rewards', ['poi_id'])
    op.create_index('ix_poi_rewards_owner_claimed', 'poi_rewards', ['owner_id', 'claimed'])


def downgrade():
    op.drop_index('ix_poi_rewards_owner_claimed', table_name='poi_rewards')
    op.drop_index('ix_poi_rewards_poi_id', table_name='poi_rewards')
    op.drop_table('poi_rewards')
    op.drop_index('ix_poi_listings_poi_id', table_name='poi_listings')
    op.drop_table('poi_listings')
    op.drop_index('ix_friend_pass_holdings_owner_runner', table_name='friend_pass_holdings')
    op.drop_table('friend_pass_holdings')
