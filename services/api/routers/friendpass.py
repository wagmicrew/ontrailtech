"""FriendPass API endpoints — pricing, supply, and benefits."""
import time
import uuid as uuid_mod
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from database import get_db
from models import User, FriendShareModel
from redis_client import cache_get, cache_set, redis
from web3_client import get_friend_shares_client

logger = logging.getLogger(__name__)

router = APIRouter()

# FriendPass config defaults (matches users.py helpers)
FRIENDPASS_BASE_PRICE_ETH = 0.001
FRIENDPASS_SLOPE_ETH = 0.0001
FRIENDPASS_MAX_SUPPLY = 100
ETH_USD_RATE = 3000.0

# Cache config
TTL_FRIENDPASS_PRICE = 7   # 7s TTL (within 5-10s window)
STALENESS_THRESHOLD = 10   # refresh if older than 10s

FRIENDPASS_BENEFITS = [
    "Early access to runner's token at best bonding curve price",
    "Reputation boost as an early supporter",
    "Exclusive routes and POI unlocks",
    "Visible supporter status on runner's profile",
]


# ── Response model ──

class FriendPassPriceResponse(BaseModel):
    currentPrice: str
    currentPriceFiat: str
    nextPrice: str
    currentSupply: int
    maxSupply: int
    benefits: list[str]


# ── Helpers ──

def _friendpass_price_eth(supply: int) -> float:
    """Linear pricing: Price(n) = basePrice + slope * n"""
    return FRIENDPASS_BASE_PRICE_ETH + FRIENDPASS_SLOPE_ETH * supply


async def _build_price_data(runner_wallet: str, current_supply: int) -> dict:
    """Build price data dict, trying on-chain read first, falling back to formula."""
    current_price_eth = _friendpass_price_eth(current_supply)
    next_price_eth = _friendpass_price_eth(current_supply + 1)

    try:
        client = get_friend_shares_client()
        if client and client.contract:
            raw_price = await client.call("getPrice", runner_wallet)
            if raw_price is not None:
                current_price_eth = raw_price / 1e18
                next_price_eth = _friendpass_price_eth(current_supply + 1)
    except Exception as e:
        logger.warning(f"Chain price read failed for {runner_wallet}, using formula: {e}")

    current_price_fiat = current_price_eth * ETH_USD_RATE

    return {
        "currentPrice": f"{current_price_eth:.6f}",
        "currentPriceFiat": f"${current_price_fiat:.2f}",
        "nextPrice": f"{next_price_eth:.6f}",
        "currentSupply": current_supply,
        "maxSupply": FRIENDPASS_MAX_SUPPLY,
        "benefits": FRIENDPASS_BENEFITS,
        "_cached_at": time.time(),
    }


# ── Endpoint ──

@router.get("/price/{runner_id}", response_model=FriendPassPriceResponse)
async def get_friendpass_price(
    runner_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Return cached FriendPass price data for a runner.

    - Serves from Redis cache (7s TTL)
    - Staleness check: refreshes if cache age > 10s
    - On cache miss: queries DB for supply, tries on-chain price, falls back to formula
    """
    cache_key = f"friendpass_price:{runner_id}"

    # Check cache
    cached = await cache_get(cache_key)
    if cached:
        cached_at = cached.get("_cached_at", 0)
        age = time.time() - cached_at
        if age <= STALENESS_THRESHOLD:
            return FriendPassPriceResponse(
                currentPrice=cached["currentPrice"],
                currentPriceFiat=cached["currentPriceFiat"],
                nextPrice=cached["nextPrice"],
                currentSupply=cached["currentSupply"],
                maxSupply=cached["maxSupply"],
                benefits=cached["benefits"],
            )
        # Stale — fall through to refresh

    # Look up runner by UUID
    try:
        runner_uuid = uuid_mod.UUID(runner_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Runner '{runner_id}' not found")

    result = await db.execute(
        select(User).where(User.id == runner_uuid)
    )
    runner = result.scalar_one_or_none()
    if not runner:
        raise HTTPException(status_code=404, detail=f"Runner '{runner_id}' not found")

    # Current supply from DB
    current_supply = await db.scalar(
        select(func.count(FriendShareModel.id))
        .where(FriendShareModel.runner_id == runner.id)
    ) or 0

    # Build price data (on-chain attempt + formula fallback)
    price_data = await _build_price_data(
        str(runner.wallet_address), int(current_supply)
    )

    # Cache with TTL
    await cache_set(cache_key, price_data, TTL_FRIENDPASS_PRICE)

    return FriendPassPriceResponse(
        currentPrice=price_data["currentPrice"],
        currentPriceFiat=price_data["currentPriceFiat"],
        nextPrice=price_data["nextPrice"],
        currentSupply=price_data["currentSupply"],
        maxSupply=price_data["maxSupply"],
        benefits=price_data["benefits"],
    )
