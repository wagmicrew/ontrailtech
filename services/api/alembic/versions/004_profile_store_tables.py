"""Add editable profile fields and step store tables

Revision ID: 004_profile_store_tables
Revises: 003_seed_aura_config, 002_auth_onboarding_columns
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '004_profile_store_tables'
down_revision = ('003_seed_aura_config', '002_auth_onboarding_columns')
branch_labels = None
depends_on = None


STORE_ITEMS = [
    {
        "slug": "profile-image-upload",
        "name": "Profile Image Change",
        "description": "Unlock one additional custom profile image upload.",
        "category": "profile",
        "item_type": "profile_image_upload",
        "step_cost": 1500,
        "fulfillment_type": "instant",
        "metadata": {"grants": {"profile_image_upload_credits": 1}},
    },
    {
        "slug": "ai-avatar",
        "name": "Custom Profile Avatar",
        "description": "Reserve an AI avatar generation slot using your uploaded image.",
        "category": "profile",
        "item_type": "ai_avatar",
        "step_cost": 4000,
        "fulfillment_type": "manual",
        "metadata": {"grants": {"ai_avatar_credits": 1}},
    },
    {
        "slug": "header-image-upload",
        "name": "Runner Header Upload",
        "description": "Unlock one additional runner profile header upload.",
        "category": "profile",
        "item_type": "header_image_upload",
        "step_cost": 2200,
        "fulfillment_type": "instant",
        "metadata": {"grants": {"header_image_upload_credits": 1}},
    },
    {
        "slug": "premium-visibility-24h",
        "name": "Premium Visibility 24 Hours",
        "description": "Boost your public runner profile visibility for 24 hours.",
        "category": "profile",
        "item_type": "premium_visibility",
        "step_cost": 5000,
        "fulfillment_type": "instant",
        "metadata": {"duration_hours": 24},
    },
    {
        "slug": "nft-giveaway",
        "name": "NFT Giveaway",
        "description": "Enter an NFT giveaway with delivery to your selected wallet.",
        "category": "web3",
        "item_type": "nft_giveaway",
        "step_cost": 3000,
        "fulfillment_type": "wallet_required",
        "metadata": {"wallet_required": True},
    },
    {
        "slug": "nft-mintspot",
        "name": "NFT Mintspot",
        "description": "Claim a mint allowlist spot delivered to your chosen wallet.",
        "category": "web3",
        "item_type": "nft_mintspot",
        "step_cost": 4500,
        "fulfillment_type": "wallet_required",
        "metadata": {"wallet_required": True},
    },
    {
        "slug": "runner-tokens",
        "name": "Token Drop",
        "description": "Redeem runner token rewards to your preferred wallet.",
        "category": "web3",
        "item_type": "tokens",
        "step_cost": 2500,
        "fulfillment_type": "wallet_required",
        "metadata": {"wallet_required": True},
    },
    {
        "slug": "friendspass",
        "name": "FriendsPass Access",
        "description": "Reserve FriendsPass delivery for your preferred wallet.",
        "category": "web3",
        "item_type": "friendspass",
        "step_cost": 3500,
        "fulfillment_type": "wallet_required",
        "metadata": {"wallet_required": True},
    },
    {
        "slug": "tge-access",
        "name": "TGE Access",
        "description": "Secure TGE access and associate it with your chosen wallet.",
        "category": "web3",
        "item_type": "tge_access",
        "step_cost": 6000,
        "fulfillment_type": "wallet_required",
        "metadata": {"wallet_required": True},
    },
]


store_items = sa.table(
    'store_items',
    sa.column('slug', sa.String),
    sa.column('name', sa.String),
    sa.column('description', sa.Text),
    sa.column('category', sa.String),
    sa.column('item_type', sa.String),
    sa.column('step_cost', sa.Integer),
    sa.column('is_active', sa.Boolean),
    sa.column('fulfillment_type', sa.String),
    sa.column('metadata', sa.JSON),
)


def upgrade() -> None:
    op.add_column('users', sa.Column('header_image_url', sa.String(length=500), nullable=True))
    op.add_column('users', sa.Column('bio', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('location', sa.String(length=120), nullable=True))
    op.add_column('users', sa.Column('preferred_reward_wallet', sa.String(length=42), nullable=True))
    op.add_column('users', sa.Column('profile_visibility_boost_until', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('profile_image_upload_credits', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('header_image_upload_credits', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('ai_avatar_credits', sa.Integer(), nullable=False, server_default='0'))

    op.create_table(
        'store_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('item_type', sa.String(length=50), nullable=False),
        sa.Column('step_cost', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('fulfillment_type', sa.String(length=30), nullable=False, server_default='instant'),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_store_items_slug', 'store_items', ['slug'], unique=True)

    op.create_table(
        'store_purchases',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('store_item_id', UUID(as_uuid=True), sa.ForeignKey('store_items.id'), nullable=False),
        sa.Column('step_cost', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='completed'),
        sa.Column('fulfillment_wallet', sa.String(length=42), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_store_purchases_user_created', 'store_purchases', ['user_id', 'created_at'], unique=False)

    op.bulk_insert(store_items, STORE_ITEMS)

    op.alter_column('users', 'profile_image_upload_credits', server_default=None)
    op.alter_column('users', 'header_image_upload_credits', server_default=None)
    op.alter_column('users', 'ai_avatar_credits', server_default=None)


def downgrade() -> None:
    op.drop_index('ix_store_purchases_user_created', table_name='store_purchases')
    op.drop_table('store_purchases')
    op.drop_index('ix_store_items_slug', table_name='store_items')
    op.drop_table('store_items')

    op.drop_column('users', 'ai_avatar_credits')
    op.drop_column('users', 'header_image_upload_credits')
    op.drop_column('users', 'profile_image_upload_credits')
    op.drop_column('users', 'profile_visibility_boost_until')
    op.drop_column('users', 'preferred_reward_wallet')
    op.drop_column('users', 'location')
    op.drop_column('users', 'bio')
    op.drop_column('users', 'header_image_url')
