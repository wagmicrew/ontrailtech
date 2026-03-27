"""EIP-712 Aura Signer — signs aura-adjusted parameters for on-chain verification.

Signs AuraParams (runnerId, effectiveSupply, auraBoost, effectiveTips, timestamp)
with the platform private key so smart contracts can verify off-chain aura computations.

Also stores periodic aura score snapshots for future Merkle proof compatibility.
"""
import logging
import time
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from eth_account import Account
from eth_account.messages import encode_typed_data
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models import AuditLog

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# EIP-712 Domain & Type Definitions
# ---------------------------------------------------------------------------

DOMAIN_DATA = {
    "name": "OnTrail",
    "version": "1",
    "chainId": 8453,  # Base L2 mainnet
}

AURA_PARAMS_TYPES = {
    "AuraParams": [
        {"name": "runnerId", "type": "address"},
        {"name": "effectiveSupply", "type": "uint256"},
        {"name": "auraBoost", "type": "uint256"},
        {"name": "effectiveTips", "type": "uint256"},
        {"name": "timestamp", "type": "uint256"},
    ],
}

# Precision multiplier: convert Decimal values to uint256-safe integers.
# e.g. auraBoost of 0.35 → 350000000000000000 (0.35 × 10^18)
WEI_PRECISION = 10**18


def _to_wei(value: Decimal | float | int) -> int:
    """Convert a decimal value to wei-scale integer for EIP-712 uint256 fields."""
    return int(Decimal(str(value)) * WEI_PRECISION)


# ---------------------------------------------------------------------------
# Core signing function
# ---------------------------------------------------------------------------

def sign_aura_params(
    runner_address: str,
    effective_supply: int,
    aura_boost: Decimal | float,
    effective_tips: Decimal | float,
) -> dict:
    """Sign AuraParams with the platform private key using EIP-712 typed data.

    Args:
        runner_address: The runner's wallet address (checksummed or lowercase).
        effective_supply: The aura-adjusted bonding curve supply (integer).
        aura_boost: The aura boost factor (e.g. 0.35 for 35% boost).
        effective_tips: The aura-adjusted effective tips value.

    Returns:
        dict with keys: signature, timestamp, params (the raw values signed).
        Returns None if platform_private_key is not configured.
    """
    settings = get_settings()
    if not settings.platform_private_key:
        logger.warning("platform_private_key not configured — skipping EIP-712 signing")
        return None

    ts = int(time.time())

    message_data = {
        "runnerId": runner_address,
        "effectiveSupply": effective_supply,
        "auraBoost": _to_wei(aura_boost),
        "effectiveTips": _to_wei(effective_tips),
        "timestamp": ts,
    }

    full_message = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
            ],
            **AURA_PARAMS_TYPES,
        },
        "primaryType": "AuraParams",
        "domain": DOMAIN_DATA,
        "message": message_data,
    }

    signable = encode_typed_data(full_message=full_message)
    signed = Account.sign_message(signable, private_key=settings.platform_private_key)

    return {
        "signature": signed.signature.hex(),
        "timestamp": ts,
        "params": {
            "runnerId": runner_address,
            "effectiveSupply": effective_supply,
            "auraBoost": _to_wei(aura_boost),
            "effectiveTips": _to_wei(effective_tips),
            "timestamp": ts,
        },
    }


# ---------------------------------------------------------------------------
# Aura snapshot storage for future Merkle proof compatibility
# ---------------------------------------------------------------------------

async def store_aura_snapshot(
    db: AsyncSession,
    runner_id: UUID,
    total_aura: Decimal | float,
) -> None:
    """Store a periodic aura score snapshot as an audit log entry.

    These snapshots form the basis for future Merkle proof trees — each
    snapshot records the runner's aura at a point in time, enabling
    off-chain proofs of historical aura state.

    Args:
        db: Async database session.
        runner_id: The runner's user ID.
        total_aura: The runner's current total aura score.
    """
    db.add(AuditLog(
        user_id=runner_id,
        action="aura_snapshot",
        resource_type="aura_index",
        resource_id=str(runner_id),
        event_metadata={
            "total_aura": str(total_aura),
            "snapshot_timestamp": int(time.time()),
            "snapshot_at": datetime.utcnow().isoformat(),
        },
    ))
    logger.debug("Stored aura snapshot for runner %s: %s", runner_id, total_aura)
