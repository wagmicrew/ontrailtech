"""Add auth and onboarding columns to users and wallets tables

Revision ID: 002_auth_onboarding_columns
Revises: 001_journey_tables
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa

revision = '002_auth_onboarding_columns'
down_revision = '001_journey_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Users table: add new columns ──
    op.add_column('users', sa.Column('password_hash', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('avatar_url', sa.String(500), nullable=True))
    op.add_column('users', sa.Column('google_id', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('onboarding_completed', sa.Boolean(), server_default='false'))

    # ── Users table: unique constraints ──
    op.create_unique_constraint('uq_users_google_id', 'users', ['google_id'])
    op.create_unique_constraint('uq_users_email', 'users', ['email'])

    # ── Users table: make username and wallet_address nullable ──
    op.alter_column('users', 'username', existing_type=sa.String(20), nullable=True)
    op.alter_column('users', 'wallet_address', existing_type=sa.String(42), nullable=True)

    # ── Wallets table: add encrypted_private_key column ──
    op.add_column('wallets', sa.Column('encrypted_private_key', sa.Text(), nullable=True))

    # ── Wallets table: unique constraint on wallet_address ──
    op.create_unique_constraint('uq_wallets_wallet_address', 'wallets', ['wallet_address'])


def downgrade() -> None:
    # ── Wallets table: remove constraint and column ──
    op.drop_constraint('uq_wallets_wallet_address', 'wallets', type_='unique')
    op.drop_column('wallets', 'encrypted_private_key')

    # ── Users table: revert nullable changes ──
    op.alter_column('users', 'wallet_address', existing_type=sa.String(42), nullable=False)
    op.alter_column('users', 'username', existing_type=sa.String(20), nullable=False)

    # ── Users table: remove constraints and columns ──
    op.drop_constraint('uq_users_email', 'users', type_='unique')
    op.drop_constraint('uq_users_google_id', 'users', type_='unique')
    op.drop_column('users', 'onboarding_completed')
    op.drop_column('users', 'google_id')
    op.drop_column('users', 'avatar_url')
    op.drop_column('users', 'password_hash')
