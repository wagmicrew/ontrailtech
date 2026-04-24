"""
Zero-Knowledge Wallet System
Handles creation and management of ZK wallets for users.
"""
import os
import secrets
import hashlib
from typing import Optional
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import Wallet, User

# Encryption key from environment - should be set in production
WALLET_ENCRYPTION_KEY = os.getenv("WALLET_ENCRYPTION_KEY")
if not WALLET_ENCRYPTION_KEY:
    # Generate a key if not set (only for development)
    WALLET_ENCRYPTION_KEY = Fernet.generate_key().decode()

fernet = Fernet(WALLET_ENCRYPTION_KEY.encode())


def generate_zk_wallet() -> tuple[str, str]:
    """
    Generate a new ZK wallet.
    Returns (wallet_address, private_key_hex)
    """
    # Generate a random private key (32 bytes)
    private_key_bytes = secrets.token_bytes(32)
    private_key_hex = private_key_bytes.hex()
    
    # Derive wallet address from private key using keccak256
    # For ZK wallets, we use a different derivation than Ethereum
    hash_digest = hashlib.sha256(private_key_hex.encode()).hexdigest()
    wallet_address = f"zk_{hash_digest[:40]}"
    
    return wallet_address, private_key_hex


def encrypt_private_key(private_key: str) -> str:
    """Encrypt a private key for storage."""
    return fernet.encrypt(private_key.encode()).decode()


def decrypt_private_key(encrypted_key: str) -> str:
    """Decrypt a private key from storage."""
    return fernet.decrypt(encrypted_key.encode()).decode()


async def get_or_create_zk_wallet(
    db: AsyncSession,
    user_id: str,
    create_if_missing: bool = True
) -> Optional[Wallet]:
    """
    Get a user's ZK wallet, or create one if it doesn't exist.
    
    Args:
        db: Database session
        user_id: User ID to look up
        create_if_missing: Whether to create a new wallet if none exists
        
    Returns:
        Wallet object or None
    """
    # Check if user already has a ZK wallet
    result = await db.execute(
        select(Wallet)
        .where(
            Wallet.user_id == user_id,
            Wallet.wallet_type == "zk"
        )
    )
    existing_wallet = result.scalar_one_or_none()
    
    if existing_wallet:
        return existing_wallet
    
    if not create_if_missing:
        return None
    
    # Create new ZK wallet
    wallet_address, private_key = generate_zk_wallet()
    encrypted_key = encrypt_private_key(private_key)
    
    new_wallet = Wallet(
        user_id=user_id,
        wallet_address=wallet_address,
        wallet_type="zk",
        encrypted_private_key=encrypted_key
    )
    
    db.add(new_wallet)
    await db.commit()
    await db.refresh(new_wallet)
    
    return new_wallet


async def auto_create_wallet_for_user(
    db: AsyncSession,
    user_id: str
) -> dict:
    """
    Auto-create a ZK wallet for a user if they don't have one.
    Returns wallet info (without private key).
    """
    wallet = await get_or_create_zk_wallet(db, user_id, create_if_missing=True)
    
    return {
        "wallet_address": wallet.wallet_address,
        "wallet_type": wallet.wallet_type,
        "created_at": wallet.created_at.isoformat() if wallet.created_at else None,
        "id": str(wallet.id)
    }
