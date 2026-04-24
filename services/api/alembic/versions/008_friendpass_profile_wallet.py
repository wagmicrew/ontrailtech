"""Add ProfileWallet, FriendPassConfig, and FriendPassSimulation tables

Revision ID: 008
Revises: 007
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '008'
down_revision = '007_friendfi_poifi_tables'
branch_labels = None
depends_on = None


def upgrade():
    # Create profile_wallets table
    op.create_table(
        'profile_wallets',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('wallet_address', sa.String(length=42), nullable=False),
        sa.Column('chain_id', sa.Integer(), nullable=False, server_default='137'),
        sa.Column('encrypted_private_key', sa.Text(), nullable=True),
        sa.Column('balance_eth', sa.Numeric(), nullable=False, server_default='0'),
        sa.Column('balance_matic', sa.Numeric(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by_admin', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
        sa.UniqueConstraint('wallet_address')
    )
    op.create_index(op.f('ix_profile_wallets_user_id'), 'profile_wallets', ['user_id'], unique=False)

    # Create friendpass_config table
    op.create_table(
        'friendpass_config',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('config_name', sa.String(length=100), nullable=False),
        sa.Column('base_price_eth', sa.Numeric(), nullable=False, server_default='0.001'),
        sa.Column('slope_eth', sa.Numeric(), nullable=False, server_default='0.0001'),
        sa.Column('max_supply_per_runner', sa.Integer(), nullable=False, server_default='100'),
        sa.Column('max_per_wallet', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('reputation_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('reputation_multiplier', sa.Numeric(), nullable=False, server_default='1.0'),
        sa.Column('reputation_base_threshold', sa.Float(), nullable=False, server_default='100.0'),
        sa.Column('tax_sitewallet_bps', sa.Integer(), nullable=False, server_default='3000'),
        sa.Column('tax_profile_owner_bps', sa.Integer(), nullable=False, server_default='4000'),
        sa.Column('tax_dao_bps', sa.Integer(), nullable=False, server_default='2000'),
        sa.Column('tax_ancient_bps', sa.Integer(), nullable=False, server_default='1000'),
        sa.Column('volatile_price_percentage', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('reputation_price_percentage', sa.Integer(), nullable=False, server_default='40'),
        sa.Column('sell_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sell_fee_bps', sa.Integer(), nullable=False, server_default='500'),
        sa.Column('min_sell_price_eth', sa.Numeric(), nullable=False, server_default='0.0005'),
        sa.Column('chain_id', sa.Integer(), nullable=False, server_default='137'),
        sa.Column('contract_address', sa.String(length=42), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('config_name')
    )

    # Create friendpass_simulations table
    op.create_table(
        'friendpass_simulations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('simulation_name', sa.String(length=200), nullable=False),
        sa.Column('config_params', sa.JSON(), nullable=False),
        sa.Column('runner_reputation', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('supply_sold', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('price_eth', sa.Numeric(), nullable=False),
        sa.Column('price_breakdown', sa.JSON(), nullable=False),
        sa.Column('tax_distribution', sa.JSON(), nullable=False),
        sa.Column('total_revenue_eth', sa.Numeric(), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Insert default FriendPass configuration
    op.execute("""
        INSERT INTO friendpass_config (
            id, config_name, base_price_eth, slope_eth, max_supply_per_runner,
            max_per_wallet, reputation_enabled, reputation_multiplier,
            reputation_base_threshold, tax_sitewallet_bps, tax_profile_owner_bps,
            tax_dao_bps, tax_ancient_bps, volatile_price_percentage,
            reputation_price_percentage, sell_enabled, sell_fee_bps,
            min_sell_price_eth, chain_id, is_active, created_at, updated_at
        )
        VALUES (
            gen_random_uuid(), 'default', 0.001, 0.0001, 100, 5, true, 1.0,
            100.0, 3000, 4000, 2000, 1000, 60, 40, true, 500, 0.0005,
            137, true, now(), now()
        )
    """)


def downgrade():
    op.drop_table('friendpass_simulations')
    op.drop_table('friendpass_config')
    op.drop_index(op.f('ix_profile_wallets_user_id'), table_name='profile_wallets')
    op.drop_table('profile_wallets')
