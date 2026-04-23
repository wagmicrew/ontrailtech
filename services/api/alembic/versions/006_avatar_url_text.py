"""Widen avatar_url and header_image_url to TEXT

Revision ID: 006_avatar_url_text
Revises: 005_installed_apps
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = '006_avatar_url_text'
down_revision = '005_installed_apps'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('users', 'avatar_url',
                    existing_type=sa.String(500),
                    type_=sa.Text(),
                    existing_nullable=True)
    op.alter_column('users', 'header_image_url',
                    existing_type=sa.String(500),
                    type_=sa.Text(),
                    existing_nullable=True)


def downgrade() -> None:
    op.alter_column('users', 'header_image_url',
                    existing_type=sa.Text(),
                    type_=sa.String(500),
                    existing_nullable=True)
    op.alter_column('users', 'avatar_url',
                    existing_type=sa.Text(),
                    type_=sa.String(500),
                    existing_nullable=True)
