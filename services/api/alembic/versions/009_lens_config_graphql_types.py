"""Add LensConfig, GraphQLMessageType, and GraphQLMessageTemplate tables

Revision ID: 009
Revises: 008_friendpass_profile_wallet
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade():
    # Create lens_config table
    op.create_table(
        'lens_config',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('lens_api_key', sa.String(length=255), nullable=True),
        sa.Column('lens_api_url', sa.String(length=255), nullable=False, server_default='https://api.testnet.lens.xyz'),
        sa.Column('lens_graphql_url', sa.String(length=255), nullable=False, server_default='https://api.testnet.lens.xyz/graphql'),
        sa.Column('lens_rpc_url', sa.String(length=255), nullable=False, server_default='https://rpc.testnet.lens.xyz'),
        sa.Column('lens_chain_id', sa.Integer(), nullable=False, server_default='371112'),
        sa.Column('auth_endpoint_url', sa.String(length=255), nullable=True),
        sa.Column('auth_secret', sa.String(length=255), nullable=True),
        sa.Column('auth_access', sa.String(length=50), nullable=False, server_default='custom'),
        sa.Column('lens_wallet_address', sa.String(length=255), nullable=True),
        sa.Column('lens_explorer_url', sa.String(length=255), nullable=True),
        sa.Column('mode', sa.String(length=20), nullable=False, server_default='simulate'),
        sa.Column('friendpass_contract_address', sa.String(length=255), nullable=True),
        sa.Column('profile_wallet_contract_address', sa.String(length=255), nullable=True),
        sa.Column('gho_onramp_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('gho_onramp_amount', sa.Numeric(), nullable=True, server_default='0.1'),
        sa.Column('lens_token_onramp_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('lens_token_onramp_amount', sa.Numeric(), nullable=True, server_default='0.1'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create graphql_message_types table
    op.create_table(
        'graphql_message_types',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('type_definition', sa.Text(), nullable=False),
        sa.Column('fields', sa.JSON(), nullable=False),
        sa.Column('query_template', sa.Text(), nullable=True),
        sa.Column('mutation_template', sa.Text(), nullable=True),
        sa.Column('lens_metadata_type', sa.String(length=50), nullable=True),
        sa.Column('metadata_attributes', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_graphql_message_types_name'), 'graphql_message_types', ['name'], unique=True)

    # Create graphql_message_templates table
    op.create_table(
        'graphql_message_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('message_type_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('template_name', sa.String(length=100), nullable=False),
        sa.Column('template_content', sa.Text(), nullable=False),
        sa.Column('variables_schema', sa.JSON(), nullable=True),
        sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['message_type_id'], ['graphql_message_types.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_graphql_message_templates_message_type_id'), 'graphql_message_templates', ['message_type_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_graphql_message_templates_message_type_id'), table_name='graphql_message_templates')
    op.drop_table('graphql_message_templates')
    op.drop_index(op.f('ix_graphql_message_types_name'), table_name='graphql_message_types')
    op.drop_table('graphql_message_types')
    op.drop_table('lens_config')
