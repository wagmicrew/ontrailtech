import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from passlib.hash import bcrypt
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import logging

from database import get_db
from models import (
    User, RunnerToken, FriendShareModel, TokenTransaction,
    ReputationEvent, TokenPool, AuraIndex, Step, StorePurchase,
)
from dependencies import get_current_user, get_user_roles
from redis_client import cache_delete, cache_get, cache_set
from web3_client import get_friend_shares_client

logger = logging.getLogger(__name__)

router = APIRouter()

# Cache TTL constants
TTL_RUNNER_PROFILE = 60   # 60s for full profile
TTL_FRIENDPASS_PRICE = 7  # 7s for FriendPass price (within 5-10s window)
MEDIA_ROOT = Path(__file__).resolve().parent.parent / "media"
MEDIA_URL_PREFIX = "/media"
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

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
    headerImageUrl: Optional[str] = None
    bio: Optional[str] = None
    reputationScore: float
    rank: int
    tokenStatus: str
    friendPass: FriendPassInfo
    stats: RunnerStats
    activityFeed: list[ActivityFeedItem]
    # Boost state
    is_boosted: bool = False
    is_golden_boosted: bool = False
    boost_expires_at: Optional[str] = None
    # Activity counts for rings
    poi_count: int = 0
    route_count: int = 0
    # Aura data
    auraLevel: str = "None"
    ancientSupporterCount: int = 0
    totalAura: str = "0"


class UserProfile(BaseModel):
    id: str
    username: Optional[str]
    wallet_address: Optional[str]
    reputation_score: float
    avatar_url: Optional[str] = None
    header_image_url: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    preferred_reward_wallet: Optional[str] = None


class MeResponse(BaseModel):
    id: str
    username: Optional[str]
    email: Optional[str]
    wallet_address: Optional[str]
    avatar_url: Optional[str]
    header_image_url: Optional[str]
    bio: Optional[str]
    location: Optional[str]
    preferred_reward_wallet: Optional[str]
    reputation_score: float
    roles: list[str]
    onboarding_completed: bool
    step_balance: int
    profile_image_upload_credits: int
    header_image_upload_credits: int
    ai_avatar_credits: int
    profile_visibility_boost_until: Optional[str]


class AvatarRequest(BaseModel):
    avatar_url: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _validate_password(password: str) -> bool:
    """8+ chars, at least one uppercase, one lowercase, one digit."""
    if len(password) < 8:
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"[a-z]", password):
        return False
    if not re.search(r"\d", password):
        return False
    return True


def _validate_wallet_address(wallet_address: Optional[str]) -> Optional[str]:
    if wallet_address is None:
        return None
    normalized = wallet_address.strip().lower()
    if normalized == "":
        return None
    if not re.fullmatch(r"0x[a-f0-9]{40}", normalized):
        raise HTTPException(status_code=422, detail="Wallet address must be a valid 0x-prefixed address")
    return normalized


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


async def _get_step_balance(db: AsyncSession, user_id) -> int:
    total_steps = await db.scalar(
        select(func.coalesce(func.sum(Step.step_count), 0)).where(Step.user_id == user_id)
    ) or 0
    spent_steps = await db.scalar(
        select(func.coalesce(func.sum(StorePurchase.step_cost), 0)).where(
            StorePurchase.user_id == user_id,
            StorePurchase.status != "cancelled",
        )
    ) or 0
    return max(int(total_steps) - int(spent_steps), 0)


async def _invalidate_runner_cache(user: User, previous_username: Optional[str] = None) -> None:
    usernames = {value.lower() for value in [user.username, previous_username] if value}
    for username in usernames:
        await cache_delete(f"runner_profile:{username}")


async def _save_uploaded_image(user_id, upload: UploadFile, media_type: str) -> str:
    content_type = upload.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Only PNG, JPEG, and WEBP images are supported")

    content = await upload.read()
    if len(content) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 5MB limit")

    suffix = ALLOWED_IMAGE_TYPES[content_type]
    target_dir = MEDIA_ROOT / "public" / "users" / str(user_id) / media_type
    target_dir.mkdir(parents=True, exist_ok=True)

    for existing_file in target_dir.iterdir():
        if existing_file.is_file():
            existing_file.unlink()

    filename = {
        "profile": f"avatar{suffix}",
        "header": f"header{suffix}",
    }.get(media_type, f"{uuid.uuid4().hex}{suffix}")
    target_path = target_dir / filename
    target_path.write_bytes(content)
    return f"{MEDIA_URL_PREFIX}/public/users/{user_id}/{media_type}/{filename}"


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


# ── Authenticated User Endpoints ──


@router.get("/me", response_model=MeResponse)
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return authenticated user profile."""
    roles = await get_user_roles(user.id, db)
    step_balance = await _get_step_balance(db, user.id)
    return MeResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        wallet_address=user.wallet_address,
        avatar_url=user.avatar_url,
        header_image_url=user.header_image_url,
        bio=user.bio,
        location=user.location,
        preferred_reward_wallet=user.preferred_reward_wallet,
        reputation_score=user.reputation_score or 0.0,
        roles=roles,
        onboarding_completed=user.onboarding_completed or False,
        step_balance=step_balance,
        profile_image_upload_credits=user.profile_image_upload_credits or 0,
        header_image_upload_credits=user.header_image_upload_credits or 0,
        ai_avatar_credits=user.ai_avatar_credits or 0,
        profile_visibility_boost_until=user.profile_visibility_boost_until.isoformat() if user.profile_visibility_boost_until else None,
    )


@router.patch("/me/profile", response_model=MeResponse)
async def update_me_profile(
    req: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    previous_username = user.username

    if req.username is not None:
        normalized_username = req.username.strip().lower()
        if normalized_username:
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,19}", normalized_username):
                raise HTTPException(status_code=422, detail="Username must use lowercase letters, numbers, or hyphens")
            result = await db.execute(
                select(User.id).where(User.username == normalized_username, User.id != user.id)
            )
            if result.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Username is already taken")
            user.username = normalized_username

    if req.email is not None:
        normalized_email = req.email.strip().lower() or None
        if normalized_email:
            existing = await db.execute(
                select(User.id).where(User.email == normalized_email, User.id != user.id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Email is already in use")
        user.email = normalized_email

    if req.bio is not None:
        user.bio = req.bio.strip()[:500] or None

    if req.location is not None:
        user.location = req.location.strip()[:120] or None

    if req.preferred_reward_wallet is not None:
        user.preferred_reward_wallet = _validate_wallet_address(req.preferred_reward_wallet)

    await db.flush()
    await _invalidate_runner_cache(user, previous_username)
    return await get_me(user=user, db=db)


@router.post("/me/avatar")
async def update_avatar(
    req: AvatarRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update authenticated user's avatar URL."""
    user.avatar_url = req.avatar_url
    await db.flush()
    await _invalidate_runner_cache(user)
    return {"avatar_url": user.avatar_url}


@router.post("/me/media/profile-image")
async def upload_profile_image(
    image: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.avatar_url and user.avatar_url.startswith(MEDIA_URL_PREFIX):
        if (user.profile_image_upload_credits or 0) <= 0:
            raise HTTPException(status_code=400, detail="Buy a profile image change in the store before replacing your custom image")
        user.profile_image_upload_credits -= 1

    user.avatar_url = await _save_uploaded_image(user.id, image, "profile")
    await db.flush()
    await _invalidate_runner_cache(user)
    return {
        "avatar_url": user.avatar_url,
        "remaining_profile_image_upload_credits": user.profile_image_upload_credits or 0,
    }


@router.post("/me/media/header-image")
async def upload_header_image(
    image: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.header_image_url and user.header_image_url.startswith(MEDIA_URL_PREFIX):
        if (user.header_image_upload_credits or 0) <= 0:
            raise HTTPException(status_code=400, detail="Buy a header image upload in the store before replacing your custom header")
        user.header_image_upload_credits -= 1

    user.header_image_url = await _save_uploaded_image(user.id, image, "header")
    await db.flush()
    await _invalidate_runner_cache(user)
    return {
        "header_image_url": user.header_image_url,
        "remaining_header_image_upload_credits": user.header_image_upload_credits or 0,
    }


@router.post("/me/change-password")
async def change_password(
    req: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password: verify current, validate new, hash and update."""
    if not user.password_hash or not bcrypt.verify(req.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    if not _validate_password(req.new_password):
        raise HTTPException(
            status_code=422,
            detail="Password must be at least 8 characters with one uppercase letter, one lowercase letter, and one digit.",
        )

    user.password_hash = bcrypt.using(rounds=10).hash(req.new_password)
    await db.flush()
    return {"message": "Password changed successfully"}


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

    # Active boosts (within 24 hours)
    boost_cutoff = datetime.utcnow() - timedelta(hours=24)
    boost_result = await db.execute(
        select(ReputationEvent)
        .where(
            ReputationEvent.user_id == runner_id,
            ReputationEvent.event_type == "boost",
            ReputationEvent.created_at >= boost_cutoff,
        )
        .order_by(ReputationEvent.created_at.desc())
        .limit(20)
    )
    boost_events = boost_result.scalars().all()
    is_boosted = len(boost_events) > 0
    is_golden_boosted = any((e.event_metadata or {}).get("golden") for e in boost_events)
    boost_expires_at = None
    if boost_events:
        latest = max(boost_events, key=lambda e: e.created_at)
        boost_expires_at = (latest.created_at + timedelta(hours=24)).isoformat()

    # POI and route counts for activity rings
    poi_count = await db.scalar(
        select(func.count(ReputationEvent.id)).where(
            ReputationEvent.user_id == runner_id,
            ReputationEvent.event_type == "poi_minted",
        )
    ) or 0
    route_count = await db.scalar(
        select(func.count(ReputationEvent.id)).where(
            ReputationEvent.user_id == runner_id,
            ReputationEvent.event_type == "route_completed",
        )
    ) or 0

    # Aura data
    aura_result = await db.execute(
        select(AuraIndex).where(AuraIndex.runner_id == runner_id)
    )
    aura_row = aura_result.scalar_one_or_none()
    aura_level = aura_row.aura_level if aura_row else "None"
    ancient_supporter_count = aura_row.ancient_supporter_count if aura_row else 0
    total_aura = str(aura_row.total_aura) if aura_row else "0"

    profile = RunnerProfileData(
        id=str(user.id),
        username=user.username,
        avatarUrl=user.avatar_url,
        headerImageUrl=user.header_image_url,
        bio=user.bio,
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
        is_boosted=is_boosted,
        is_golden_boosted=is_golden_boosted,
        boost_expires_at=boost_expires_at,
        poi_count=int(poi_count),
        route_count=int(route_count),
        auraLevel=aura_level,
        ancientSupporterCount=ancient_supporter_count,
        totalAura=total_aura,
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
        avatar_url=user.avatar_url,
        header_image_url=user.header_image_url,
        bio=user.bio,
        location=user.location,
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
