#!/usr/bin/env python3
"""
Seed Lens Configuration with Testnet Settings
Run this on the server after database migration to initialize Lens config.
"""
import asyncio
import sys
import os

# Add the services/api directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'services', 'api'))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from models import LensConfig
from decimal import Decimal
from datetime import datetime
from uuid import uuid4

# Read DATABASE_URL from environment or services/api/.env
_env_file = os.path.join(os.path.dirname(__file__), '..', 'services', 'api', '.env')
if os.path.exists(_env_file):
    with open(_env_file) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line.startswith('DATABASE_URL='):
                os.environ.setdefault('DATABASE_URL', _line.split('=', 1)[1])
                break
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql+asyncpg://postgres:@localhost:5432/ontrail_tech')

async def seed_lens_config():
    """Seed the Lens configuration with testnet settings."""
    
    # Create async engine
    engine = create_async_engine(DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Check if config already exists
        from sqlalchemy import select
        result = await session.execute(select(LensConfig))
        existing_config = result.scalar_one_or_none()
        
        if existing_config:
            print("Lens config already exists. Updating with testnet settings...")
            # Update existing config
            existing_config.lens_api_url = "https://api.testnet.lens.xyz"
            existing_config.lens_graphql_url = "https://api.testnet.lens.xyz/graphql"
            existing_config.lens_rpc_url = "https://rpc.testnet.lens.xyz"
            existing_config.lens_chain_id = 371112
            existing_config.lens_wallet_address = "0x034bc3b8faae33369ad27ed89f455a95ef8f9629"
            existing_config.lens_explorer_url = "https://explorer.lens.xyz"
            existing_config.mode = "simulate"
            existing_config.auth_access = "custom"
            existing_config.updated_at = datetime.utcnow()
        else:
            print("Creating new Lens config with testnet settings...")
            # Create new config
            new_config = LensConfig(
                id=uuid4(),
                lens_api_key=None,  # User will set this via admin UI
                lens_api_url="https://api.testnet.lens.xyz",
                lens_graphql_url="https://api.testnet.lens.xyz/graphql",
                lens_rpc_url="https://rpc.testnet.lens.xyz",
                lens_chain_id=371112,
                auth_endpoint_url=None,
                auth_secret=None,
                auth_access="custom",
                lens_wallet_address="0x034bc3b8faae33369ad27ed89f455a95ef8f9629",
                lens_explorer_url="https://explorer.lens.xyz",
                mode="simulate",
                friendpass_contract_address=None,
                profile_wallet_contract_address=None,
                gho_onramp_enabled=False,
                gho_onramp_amount=Decimal("0.1"),
                lens_token_onramp_enabled=False,
                lens_token_onramp_amount=Decimal("0.1"),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            session.add(new_config)
        
        await session.commit()
        print("Lens configuration seeded successfully!")
        print("Testnet Address: 0x034bc3b8faae33369ad27ed89f455a95ef8f9629")
        print("Mode: simulate")
        print("Chain ID: 371112 (Lens Chain Testnet)")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(seed_lens_config())
