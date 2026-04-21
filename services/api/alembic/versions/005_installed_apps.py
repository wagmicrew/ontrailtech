"""create installed_apps table

Revision ID: 005_installed_apps
Revises: 004_profile_store_tables
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '005_installed_apps'
down_revision = '004_profile_store_tables'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'installed_apps',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('app_id', sa.String(255), nullable=False, unique=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('version', sa.String(50), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('author', sa.String(255), nullable=True),
        sa.Column('icon', sa.Text, nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='uploaded'),
        sa.Column('settings', JSONB, nullable=False, server_default='{}'),
        sa.Column('settings_schema', JSONB, nullable=False, server_default='[]'),
        sa.Column('tables_created', JSONB, nullable=False, server_default='[]'),
        sa.Column('manifest', JSONB, nullable=False, server_default='{}'),
        sa.Column('installed_at', sa.DateTime, nullable=True),
        sa.Column('updated_at', sa.DateTime, nullable=True),
    )
    op.create_index('ix_installed_apps_app_id', 'installed_apps', ['app_id'])


def downgrade():
    op.drop_index('ix_installed_apps_app_id', table_name='installed_apps')
    op.drop_table('installed_apps')
