"""
Profile Wallet System for Polygon Chain
Manages creation and management of profile wallets for users on Polygon.
Profile wallets are used for FriendPass minting and transfers.
"""
import os
import secrets
import logging
from typing import Optional
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from web3 import Web3
from cryptography.fernet import Fernet

from models import ProfileWallet, User
from redis_client import cache_get, cache_set

logger = logging.getLogger(__name__)

# Encryption key from environment
WALLET_ENCRYPTION_KEY = os.getenv("WALLET_ENCRYPTION_KEY")
if not WALLET_ENCRYPTION_KEY:
    WALLET_ENCRYPTION_KEY = Fernet.generate_key().decode()

fernet = Fernet(WALLET_ENCRYPTION_KEY.encode())

# Polygon RPC endpoints
POLYGON_MAINNET_RPC = os.getenv("POLYGON_MAINNET_RPC", "https://polygon-rpc.com")
POLYGON_TESTNET_RPC = os.getenv("POLYGON_TESTNET_RPC", "https://rpc-amoy.polygon.technology")

POLYGON_CHAIN_IDS = {
    "mainnet": 137,
    "testnet": 80002,  # Amoy testnet
}


def generate_polygon_wallet() -> tuple[str, str]:
    """
    Generate a new Polygon wallet.
    Returns (wallet_address, private_key_hex)
    """
    # Generate a random private key (32 bytes)
    private_key_bytes = secrets.token_bytes(32)
    private_key_hex = "0x" + private_key_bytes.hex()
    
    # Derive wallet address from private key using Web3
    account = Web3().eth.account.from_key(private_key_hex)
    wallet_address = account.address
    
    return wallet_address, private_key_hex


def encrypt_private_key(private_key: str) -> str:
    """Encrypt a private key for storage."""
    return fernet.encrypt(private_key.encode()).decode()


def decrypt_private_key(encrypted_key: str) -> str:
    """Decrypt a private key from storage."""
    return fernet.decrypt(encrypted_key.encode()).decode()


def get_web3_instance(chain_id: int = 137) -> Web3:
    """
    Get a Web3 instance for the specified chain.
    Defaults to Polygon mainnet (137).
    """
    if chain_id == 137:
        rpc_url = POLYGON_MAINNET_RPC
    elif chain_id == 80002:
        rpc_url = POLYGON_TESTNET_RPC
    else:
        raise ValueError(f"Unsupported chain ID: {chain_id}")
    
    return Web3(Web3.HTTPProvider(rpc_url))


async def get_or_create_profile_wallet(
    db: AsyncSession,
    user_id: str,
    chain_id: int = 137,
    create_if_missing: bool = True
) -> Optional[ProfileWallet]:
    """
    Get a user's profile wallet, or create one if it doesn't exist.
    
    Args:
        db: Database session
        user_id: User ID to look up
        chain_id: Chain ID (default 137 for Polygon mainnet)
        create_if_missing: Whether to create a new wallet if none exists
        
    Returns:
        ProfileWallet object or None
    """
    # Check cache first
    cache_key = f"profile_wallet:{user_id}:{chain_id}"
    cached = await cache_get(cache_key)
    if cached:
        return ProfileWallet(**cached)
    
    # Check if user already has a profile wallet for this chain
    result = await db.execute(
        select(ProfileWallet)
        .where(
            ProfileWallet.user_id == user_id,
            ProfileWallet.chain_id == chain_id
        )
    )
    existing_wallet = result.scalar_one_or_none()
    
    if existing_wallet:
        # Cache the wallet
        await cache_set(cache_key, {
            "id": str(existing_wallet.id),
            "user_id": str(existing_wallet.user_id),
            "wallet_address": existing_wallet.wallet_address,
            "chain_id": existing_wallet.chain_id,
            "is_active": existing_wallet.is_active,
        }, 300)  # 5 min cache
        return existing_wallet
    
    if not create_if_missing:
        return None
    
    # Create new profile wallet
    wallet_address, private_key = generate_polygon_wallet()
    encrypted_key = encrypt_private_key(private_key)
    
    new_wallet = ProfileWallet(
        user_id=user_id,
        wallet_address=wallet_address,
        chain_id=chain_id,
        encrypted_private_key=encrypted_key,
        is_active=True,
        created_by_admin=False
    )
    
    db.add(new_wallet)
    await db.commit()
    await db.refresh(new_wallet)
    
    logger.info(f"Created profile wallet {wallet_address} for user {user_id} on chain {chain_id}")
    
    return new_wallet


async def get_profile_wallet_balance(
    db: AsyncSession,
    user_id: str,
    chain_id: int = 137
) -> dict:
    """
    Get the current balance of a user's profile wallet.
    Updates the database with latest balances from chain.
    
    Returns:
        Dict with 'balance_eth' and 'balance_matic'
    """
    result = await db.execute(
        select(ProfileWallet)
        .where(
            ProfileWallet.user_id == user_id,
            ProfileWallet.chain_id == chain_id,
            ProfileWallet.is_active == True
        )
    )
    wallet = result.scalar_one_or_none()
    
    if not wallet:
        return {"balance_eth": "0", "balance_matic": "0"}
    
    try:
        w3 = get_web3_instance(chain_id)
        balance_wei = w3.eth.get_balance(wallet.wallet_address)
        balance_matic = Web3.from_wei(balance_wei, 'ether')
        
        # Convert MATIC to ETH (simplified - in production use price oracle)
        # For now, assume 1 MATIC = 0.0005 ETH (update with real price feed)
        matic_to_eth_rate = Decimal("0.0005")
        balance_eth = Decimal(str(balance_matic)) * matic_to_eth_rate
        
        # Update database
        wallet.balance_matic = Decimal(str(balance_matic))
        wallet.balance_eth = balance_eth
        await db.commit()
        
        return {
            "balance_eth": str(balance_eth),
            "balance_matic": str(balance_matic)
        }
    except Exception as e:
        logger.error(f"Failed to get balance for wallet {wallet.wallet_address}: {e}")
        # Return cached balances
        return {
            "balance_eth": str(wallet.balance_eth or 0),
            "balance_matic": str(wallet.balance_matic or 0)
        }


async def fund_profile_wallet(
    db: AsyncSession,
    user_id: str,
    amount_matic: float,
    chain_id: int = 137
) -> dict:
    """
    Fund a profile wallet with MATIC from the admin treasury.
    This requires admin privileges and should only be called from admin endpoints.
    
    Args:
        db: Database session
        user_id: User ID to fund
        amount_matic: Amount of MATIC to send
        chain_id: Chain ID
        
    Returns:
        Transaction hash if successful
    """
    result = await db.execute(
        select(ProfileWallet)
        .where(
            ProfileWallet.user_id == user_id,
            ProfileWallet.chain_id == chain_id,
            ProfileWallet.is_active == True
        )
    )
    wallet = result.scalar_one_or_none()
    
    if not wallet:
        raise ValueError(f"No active profile wallet found for user {user_id}")
    
    # In production, this would:
    # 1. Decrypt admin treasury private key
    # 2. Build and sign transaction
    # 3. Send transaction to chain
    # 4. Return tx hash
    
    # For now, just update the balance in database (simulated)
    current_balance = Decimal(str(wallet.balance_matic or 0))
    wallet.balance_matic = current_balance + Decimal(str(amount_matic))
    
    # Update ETH balance estimate
    matic_to_eth_rate = Decimal("0.0005")
    wallet.balance_eth = wallet.balance_matic * matic_to_eth_rate
    
    await db.commit()
    
    logger.info(f"Funded wallet {wallet.wallet_address} with {amount_matic} MATIC")
    
    return {
        "wallet_address": wallet.wallet_address,
        "amount_matic": str(amount_matic),
        "new_balance_matic": str(wallet.balance_matic),
        "tx_hash": "0x" + secrets.token_hex(32)  # Simulated tx hash
    }


async def list_all_profile_wallets(
    db: AsyncSession,
    chain_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0
) -> list[dict]:
    """
    List all profile wallets (admin only).
    
    Returns:
        List of wallet information
    """
    query = select(ProfileWallet).order_by(ProfileWallet.created_at.desc())
    
    if chain_id is not None:
        query = query.where(ProfileWallet.chain_id == chain_id)
    
    query = query.limit(limit).offset(offset)
    
    result = await db.execute(query)
    wallets = result.scalars().all()
    
    return [
        {
            "id": str(w.id),
            "user_id": str(w.user_id),
            "wallet_address": w.wallet_address,
            "chain_id": w.chain_id,
            "balance_eth": str(w.balance_eth or 0),
            "balance_matic": str(w.balance_matic or 0),
            "is_active": w.is_active,
            "created_by_admin": w.created_by_admin,
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w in wallets
    ]
