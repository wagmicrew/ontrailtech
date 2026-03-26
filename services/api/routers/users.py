from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import logging

from database import get_db
from models import (
    User, RunnerToken, FriendShareModel, TokenTransaction,
    ReputationEvent, TokenPool,
)
from dependencies import get_current_user
from redis_client import cache_get, cache_set
from web3_client import get_friend_shares_client

logger = logging.getLogger(__name__)

router = APIRouter()

# Cache TTL constants
TTL_RUNNER_PROFILE = 60   # 60s for full profile
TTL_FRIENDPASS_PRICE = 7  # 7s for FriendPass price (within 5-10s window)

# FriendPass config defaults
FRIENDPASS_BASE_PRICE_ETH = 0.001   # 0.001 ETH base
FRIENDPASS_SLOPE_ETH = 0.0001       # linear slope per mint
FRIENDPASS_MAX_SUPPLY = 100         # default max supply
ETH_USD_RATE = 3000.0               # fallback ETH/USD rate (refreshed separately)


# ── Pydantic response models ──

class FriendPassInfo(BaseModel):
    sold: int
    maxSupply: int
    currentPrice: str
    currentPriceFiat: str
    nextPrice: str


class RunnerStats(BaseModel):
    totalSupporters: int
    totalTips: str
    tokenProgress: int


class ActivityFeedItem(BaseModel):
    type: str          # 'join' | 'friendpass_buy' | 'tip' | 'rank_up'
    username: Optional[str]
    amount: Optional[str]
    timeAgo: str


class RunnerProfileData(BaseModel):
    id: str
    username: str
    avatarUrl: Optional[str]
    reputationScore: float
    rank: int
    tokenStatus: str
    friendPass: FriendPassInfo
    stats: RunnerStats
    activityFeed: list[ActivityFeedItem]


class UserProfile(BaseModel):
    id: str
    username: str
    wallet_address: str
    reputation_score: float

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None


# ── Helpers ──

def _format_time_ago(dt: datetime) -> str:
    delta = datetime.utcnow() - dt
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return f"{seconds}s ago"
    if seconds < 3600:
        return f"{seconds // 60}m ago"
    return f"{seconds // 3600}h ago"


def _eth_from_wei(wei: int) -> str:
    return f"{wei / 1e18:.6f}"


def _friendpass_price_eth(supply: int) -> float:
    """Linear pricing: Price(n) = basePrice + slope * n"""
    return FRIENDPASS_BASE_PRICE_ETH + FRIENDPASS_SLOPE_ETH * supply


async def _get_friendpass_price_cached(runner_wallet: str, sold: int) -> dict:
    """Return FriendPass price from Redis cache; read from chain on miss."""
    cache_key = f"friendpass_price:{runner_wallet}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    # Try on-chain read first
    current_price_eth = _friendpass_price_eth(sold)
    next_price_eth = _friendpass_price_eth(sold + 1)

    try:
        client = get_friend_shares_client()
        if client and client.contract:
            raw_price = await client.call("getPrice", runner_wallet)
            if raw_price is not None:
                current_price_eth = raw_price / 1e18
                next_price_eth = _friendpass_price_eth(sold + 1)
    except Exception as e:
        logger.warning(f"Chain price read failed for {runner_wallet}, using formula: {e}")

    current_price_fiat = current_price_eth * ETH_USD_RATE
    price_data = {
        "currentPrice": f"{current_price_eth:.6f}",
        "currentPriceFiat": f"${current_price_fiat:.2f}",
        "nextPrice": f"{next_price_eth:.6f}",
    }
    await cache_set(cache_key, price_data, TTL_FRIENDPASS_PRICE)
    return price_data


async def _get_runner_rank(db: AsyncSession, user_id) -> int:
    """Rank = count of users with higher reputation + 1."""
    user_rep = await db.scalar(
        select(User.reputation_score).where(User.id == user_id)
    ) or 0.0
    higher_count = await db.scalar(
        select(func.count(User.id)).where(User.reputation_score > user_rep)
    ) or 0
    return int(higher_count) + 1


async def _build_activity_feed(db: AsyncSession, runner_id) -> list[ActivityFeedItem]:
    """Build activity feed: recent joins, FriendPass buys, tips — last 1h, max 10."""
    cutoff = datetime.utcnow() - timedelta(hours=1)
    feed: list[ActivityFeedItem] = []

    # Recent FriendPass buys (TokenTransactions for this runner)
    tx_result = await db.execute(
        select(TokenTransaction, User)
        .join(User, User.id == TokenTransaction.buyer_id, isouter=True)
        .where(
            TokenTransaction.runner_id == runner_id,
            TokenTransaction.created_at >= cutoff,
        )
        .order_by(TokenTransaction.created_at.desc())
        .limit(10)
    )
    for tx, buyer in tx_result.all():
        feed.append(ActivityFeedItem(
            type="friendpass_buy",
            username=buyer.username if buyer else None,
            amount=f"{float(tx.price):.6f}",
            timeAgo=_format_time_ago(tx.created_at),
        ))

    # Recent joins (reputation events of type 'signup' referencing this runner context)
    join_result = await db.execute(
        select(ReputationEvent, User)
        .join(User, User.id == ReputationEvent.user_id)
        .where(
            ReputationEvent.event_type == "signup",
            ReputationEvent.created_at >= cutoff,
        )
        .order_by(ReputationEvent.created_at.desc())
        .limit(5)
    )
    for event, user in join_result.all():
        feed.append(ActivityFeedItem(
            type="join",
            username=user.username,
            amount=None,
            timeAgo=_format_time_ago(event.created_at),
        ))

    # Sort combined feed by recency (most recent first), cap at 10
    feed.sort(key=lambda x: x.timeAgo)
    return feed[:10]


# ── Endpoints ──

@router.get("/runner/{username}", response_model=RunnerProfileData)
async def get_runner_profile_aggregated(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregated runner profile endpoint for the first-time user journey landing page.
    Returns reputation, rank, token status, FriendPass supply + cached price, and activity feed.
    Full response cached in Redis with 60s TTL.
    FriendPass price cached separately with 5-10s TTL.
    """
    cache_key = f"runner_profile:{username.lower()}"
    cached = await cache_get(cache_key)
    if cached:
        return RunnerProfileData(**cached)

    # Fetch runner user
    result = await db.execute(
        select(User).where(User.username == username.lower())
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=f"Runner '{username}' not found")

    runner_id = user.id

    # Rank
    rank = await _get_runner_rank(db, runner_id)

    # Token status
    token_result = await db.execute(
        select(RunnerToken).where(RunnerToken.runner_id == runner_id)
        .order_by(RunnerToken.created_at.desc())
        .limit(1)
    )
    token = token_result.scalar_one_or_none()
    token_status = token.status if token else "bonding_curve"

    # FriendPass supply (count distinct owners from friend_shares table)
    sold_count = await db.scalar(
        select(func.count(FriendShareModel.id))
        .where(FriendShareModel.runner_id == runner_id)
    ) or 0

    # FriendPass price (cached separately with short TTL)
    price_data = await _get_friendpass_price_cached(
        str(user.wallet_address), int(sold_count)
    )

    # Total supporters (distinct owners)
    supporter_count = await db.scalar(
        select(func.count(func.distinct(FriendShareModel.owner_id)))
        .where(FriendShareModel.runner_id == runner_id)
    ) or 0

    # Total tips (sum of token transaction prices for this runner)
    total_tips_raw = await db.scalar(
        select(func.sum(TokenTransaction.price))
        .where(TokenTransaction.runner_id == runner_id)
    ) or 0

    # Token progress (0-100%)
    token_progress = 0
    if token:
        pool = float(token.bonding_curve_pool or 0)
        pool_result = await db.execute(
            select(TokenPool).where(TokenPool.runner_id == runner_id).limit(1)
        )
        token_pool = pool_result.scalar_one_or_none()
        threshold = float(token_pool.threshold) if token_pool and token_pool.threshold else 1.0
        if threshold > 0:
            token_progress = min(100, int((pool / threshold) * 100))

    # Activity feed
    activity_feed = await _build_activity_feed(db, runner_id)

    profile = RunnerProfileData(
        id=str(user.id),
        username=user.username,
        avatarUrl=None,  # avatar system TBD (Task 14)
        reputationScore=round(user.reputation_score or 0.0, 2),
        rank=rank,
        tokenStatus=token_status,
        friendPass=FriendPassInfo(
            sold=int(sold_count),
            maxSupply=FRIENDPASS_MAX_SUPPLY,
            currentPrice=price_data["currentPrice"],
            currentPriceFiat=price_data["currentPriceFiat"],
            nextPrice=price_data["nextPrice"],
        ),
        stats=RunnerStats(
            totalSupporters=int(supporter_count),
            totalTips=f"{float(total_tips_raw):.6f}",
            tokenProgress=token_progress,
        ),
        activityFeed=activity_feed,
    )

    # Cache full profile (60s TTL) — exclude price_data which has its own TTL
    await cache_set(cache_key, profile.model_dump(), TTL_RUNNER_PROFILE)
    return profile


@router.get("/{user_id}", response_model=UserProfile)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(
        id=str(user.id),
        username=user.username,
        wallet_address=user.wallet_address,
        reputation_score=user.reputation_score or 0.0,
    )


@router.get("/{user_id}/reputation")
async def get_reputation(user_id: str, db: AsyncSession = Depends(get_db)):
    from engines.reputation_engine import calculate_reputation
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    breakdown = await calculate_reputation(db, user.id)
    return breakdown


@router.get("/{user_id}/roles")
async def get_user_roles_endpoint(user_id: str, db: AsyncSession = Depends(get_db)):
    from dependencies import get_user_roles
    roles = await get_user_roles(user_id, db)
    return {"user_id": user_id, "roles": roles}
