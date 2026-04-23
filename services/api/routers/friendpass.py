"""FriendPass API endpoints — pricing, supply, buy, sell, holdings."""
import time
import uuid as uuid_mod
import logging
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional

from database import get_db
from models import User, FriendShareModel, FriendPassHolding
from dependencies import get_current_user
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


# ── Request / response models ──

class BuyFriendPassRequest(BaseModel):
    runner_id: str


class BuyFriendPassResponse(BaseModel):
    holding_id: str
    runner_id: str
    runner_username: Optional[str]
    passes: int
    price_eth: str
    price_fiat: str
    supply_after: int
    max_supply: int


class FriendPassHoldingOut(BaseModel):
    holding_id: str
    runner_id: str
    runner_username: Optional[str]
    runner_avatar: Optional[str]
    passes: int
    purchase_price_eth: str
    purchased_at: str
    sold: bool


class HolderOut(BaseModel):
    owner_id: str
    username: Optional[str]
    avatar_url: Optional[str]
    passes: int
    purchased_at: str


# ── Anti-whale: max 5 passes per wallet ──
MAX_PASSES_PER_WALLET = 5


@router.post("/buy", response_model=BuyFriendPassResponse)
async def buy_friend_pass(
    req: BuyFriendPassRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Purchase a FriendPass for a runner (off-chain, mirroring ERC-1155 logic)."""
    # Resolve runner
    try:
        runner_uuid = uuid_mod.UUID(req.runner_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Runner not found")

    runner_result = await db.execute(select(User).where(User.id == runner_uuid))
    runner = runner_result.scalar_one_or_none()
    if not runner:
        raise HTTPException(status_code=404, detail="Runner not found")

    # Self-purchase guard
    if str(user.id) == str(runner.id):
        raise HTTPException(status_code=400, detail="Cannot buy your own FriendPass")

    # Count existing supply for this runner (from FriendPassHolding table)
    supply_result = await db.scalar(
        select(func.sum(FriendPassHolding.passes))
        .where(FriendPassHolding.runner_id == runner.id, FriendPassHolding.sold == False)
    ) or 0
    current_supply = int(supply_result)

    if current_supply >= FRIENDPASS_MAX_SUPPLY:
        raise HTTPException(status_code=400, detail="supply_exhausted")

    # Anti-whale: count user's active passes for this runner
    user_holding_result = await db.scalar(
        select(func.sum(FriendPassHolding.passes))
        .where(
            FriendPassHolding.runner_id == runner.id,
            FriendPassHolding.owner_id == user.id,
            FriendPassHolding.sold == False,
        )
    ) or 0
    if int(user_holding_result) >= MAX_PASSES_PER_WALLET:
        raise HTTPException(status_code=400, detail="anti_whale")

    # Price calculation
    price_eth = _friendpass_price_eth(current_supply)
    price_eth_decimal = Decimal(str(price_eth))
    price_fiat = price_eth * ETH_USD_RATE

    # Record holding
    holding = FriendPassHolding(
        owner_id=user.id,
        runner_id=runner.id,
        passes=1,
        purchase_price_eth=price_eth_decimal,
    )
    db.add(holding)
    await db.flush()

    # Invalidate price cache so next GET reflects new supply
    try:
        cache_key = f"friendpass_price:{req.runner_id}"
        if redis:
            await redis.delete(cache_key)
    except Exception:
        pass

    await db.commit()
    await db.refresh(holding)

    return BuyFriendPassResponse(
        holding_id=str(holding.id),
        runner_id=str(runner.id),
        runner_username=runner.username,
        passes=holding.passes,
        price_eth=f"{price_eth:.6f}",
        price_fiat=f"${price_fiat:.2f}",
        supply_after=current_supply + 1,
        max_supply=FRIENDPASS_MAX_SUPPLY,
    )


@router.post("/sell/{holding_id}", response_model=dict)
async def sell_friend_pass(
    holding_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sell back a FriendPass at 85% of current market price (exit penalty)."""
    try:
        holding_uuid = uuid_mod.UUID(holding_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Holding not found")

    result = await db.execute(
        select(FriendPassHolding).where(
            FriendPassHolding.id == holding_uuid,
            FriendPassHolding.owner_id == user.id,
        )
    )
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    if holding.sold:
        raise HTTPException(status_code=400, detail="Already sold")

    # Current supply for this runner
    supply_result = await db.scalar(
        select(func.sum(FriendPassHolding.passes))
        .where(FriendPassHolding.runner_id == holding.runner_id, FriendPassHolding.sold == False)
    ) or 1
    current_supply = max(1, int(supply_result))

    # Sell price = 85% of current market price
    market_price_eth = _friendpass_price_eth(current_supply - 1)
    sale_price_eth = Decimal(str(market_price_eth * 0.85))

    holding.sold = True
    holding.sale_price_eth = sale_price_eth
    holding.sold_at = __import__('datetime').datetime.utcnow()

    # Invalidate price cache
    try:
        if redis:
            await redis.delete(f"friendpass_price:{str(holding.runner_id)}")
    except Exception:
        pass

    await db.commit()
    return {"sale_price_eth": f"{sale_price_eth:.6f}", "sale_price_fiat": f"${float(sale_price_eth) * ETH_USD_RATE:.2f}"}


@router.get("/my-holdings", response_model=List[FriendPassHoldingOut])
async def get_my_holdings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all active FriendPass holdings for the authenticated user."""
    result = await db.execute(
        select(FriendPassHolding, User)
        .join(User, User.id == FriendPassHolding.runner_id)
        .where(FriendPassHolding.owner_id == user.id, FriendPassHolding.sold == False)
        .order_by(FriendPassHolding.purchased_at.desc())
    )
    rows = result.all()
    return [
        FriendPassHoldingOut(
            holding_id=str(h.id),
            runner_id=str(h.runner_id),
            runner_username=r.username,
            runner_avatar=r.avatar_url,
            passes=h.passes,
            purchase_price_eth=str(h.purchase_price_eth),
            purchased_at=h.purchased_at.isoformat(),
            sold=h.sold,
        )
        for h, r in rows
    ]


@router.get("/holders/{runner_id}", response_model=List[HolderOut])
async def get_holders(
    runner_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return all active FriendPass holders for a given runner."""
    try:
        runner_uuid = uuid_mod.UUID(runner_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Runner not found")

    result = await db.execute(
        select(FriendPassHolding, User)
        .join(User, User.id == FriendPassHolding.owner_id)
        .where(FriendPassHolding.runner_id == runner_uuid, FriendPassHolding.sold == False)
        .order_by(FriendPassHolding.purchased_at.desc())
    )
    rows = result.all()
    return [
        HolderOut(
            owner_id=str(h.owner_id),
            username=u.username,
            avatar_url=u.avatar_url,
            passes=h.passes,
            purchased_at=h.purchased_at.isoformat(),
        )
        for h, u in rows
    ]
