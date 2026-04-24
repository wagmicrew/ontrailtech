import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from passlib.hash import bcrypt
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime, timedelta
import logging

from database import get_db
from models import (
    User, RunnerToken, FriendShareModel, FriendPassHolding, TokenTransaction,
    ReputationEvent, TokenPool, AuraIndex, Step, StorePurchase,
    POI, Route, AdminConfig,
)
from dependencies import get_current_user, get_user_roles, optional_current_user
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


class ViewerRelationship(BaseModel):
    """Defines the relationship between the viewer and the profile owner."""
    state: str  # 'guest' | 'owner' | 'friend'
    is_authenticated: bool
    is_friendpass_holder: bool = False
    friendpass_count: int = 0
    can_buy_friendpass: bool = True
    can_sell_friendpass: bool = False


class TeaserContent(BaseModel):
    """Teaser content for guest viewers."""
    locked_pois_count: int = 0
    locked_routes_count: int = 0
    locked_messages_count: int = 0
    has_bonding_curve: bool = True


class UnlockedContent(BaseModel):
    """Unlocked content for friend/owner viewers."""
    pois: list[dict] = []
    routes: list[dict] = []
    messages: list[dict] = []
    bonding_curve_visible: bool = True
    friendpass_holders: list[dict] = []


class RunnerProfileData(BaseModel):
    id: str
    username: str
    avatarUrl: Optional[str]
    headerImageUrl: Optional[str] = None
    bio: Optional[str] = None
    wallet_address: Optional[str] = None
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
    # Viewer relationship state (guest/owner/friend)
    viewer: ViewerRelationship
    # Content visibility based on relationship
    teaser: TeaserContent
    unlocked: UnlockedContent


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


@router.post("/me/activate-runner")
async def activate_runner_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark the authenticated user as an active runner (sets onboarding_completed=True).
    Useful for admin accounts that skipped the onboarding flow but still want a
    public runner profile, token pool, FriendPass, etc.
    """
    user.onboarding_completed = True
    await db.flush()
    await _invalidate_runner_cache(user)
    return {"message": "Runner profile activated", "username": user.username}


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


@router.delete("/me/avatar")
async def remove_avatar(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the authenticated user's uploaded avatar (resets to default)."""
    user.avatar_url = None
    await db.flush()
    await _invalidate_runner_cache(user)
    return {"message": "Avatar removed"}


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
    viewer: User | None = Depends(optional_current_user),
):
    """
    Aggregated runner profile endpoint with three-state visibility:
    - Guest: Teaser content with CTAs to join/buy FriendPass
    - Friend: Unlocked content for FriendPass holders
    - Owner: Full admin access to manage profile

    Returns reputation, rank, token status, FriendPass supply + cached price, and activity feed.
    Full response cached in Redis with 60s TTL (per-viewer-state cache key).
    FriendPass price cached separately with 5-10s TTL.
    """
    # Determine viewer relationship for cache key
    viewer_id = str(viewer.id) if viewer else "guest"
    cache_key = f"runner_profile:{username.lower()}:viewer:{viewer_id}"
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

    # Determine viewer relationship state
    is_authenticated = viewer is not None
    is_owner = is_authenticated and str(viewer.id) == str(runner_id)

    # Check if viewer holds FriendPass for this runner
    friendpass_count = 0
    is_friendpass_holder = False
    if is_authenticated and not is_owner:
        friendpass_count = await db.scalar(
            select(func.sum(FriendPassHolding.passes))
            .where(
                FriendPassHolding.runner_id == runner_id,
                FriendPassHolding.owner_id == viewer.id,
                FriendPassHolding.sold == False,
            )
        ) or 0
        is_friendpass_holder = friendpass_count > 0

    # Determine relationship state
    if is_owner:
        relationship_state = "owner"
    elif is_friendpass_holder:
        relationship_state = "friend"
    else:
        relationship_state = "guest"

    # Check if viewer can buy/sell FriendPass
    can_buy = True
    can_sell = is_friendpass_holder and friendpass_count > 0
    if is_authenticated and not is_owner:
        # Anti-whale check: max 5 passes per wallet
        if friendpass_count >= 5:
            can_buy = False

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

    # Build content visibility based on relationship state
    # Fetch POIs and routes counts for teaser
    locked_pois_count = poi_count if relationship_state == "guest" else 0
    locked_routes_count = route_count if relationship_state == "guest" else 0

    # Build unlocked content for friends/owners
    unlocked_pois = []
    unlocked_routes = []
    unlocked_messages = []
    friendpass_holders_list = []

    if relationship_state in ("friend", "owner"):
        # Fetch actual POIs for this runner
        poi_result = await db.execute(
            select(POI).where(POI.owner_id == runner_id).limit(10)
        )
        for poi in poi_result.scalars().all():
            unlocked_pois.append({
                "id": str(poi.id),
                "name": poi.name,
                "latitude": poi.latitude,
                "longitude": poi.longitude,
                "rarity": poi.rarity,
            })

        # Fetch routes for this runner
        route_result = await db.execute(
            select(Route).where(Route.creator_id == runner_id).limit(10)
        )
        for route in route_result.scalars().all():
            unlocked_routes.append({
                "id": str(route.id),
                "name": route.name,
                "difficulty": route.difficulty,
                "distance_km": route.distance_km,
            })

        # Fetch FriendPass holders for friends/owners
        holders_result = await db.execute(
            select(FriendPassHolding, User)
            .join(User, User.id == FriendPassHolding.owner_id)
            .where(
                FriendPassHolding.runner_id == runner_id,
                FriendPassHolding.sold == False,
            )
            .order_by(FriendPassHolding.purchased_at.desc())
            .limit(20)
        )
        for h, u in holders_result.all():
            friendpass_holders_list.append({
                "owner_id": str(h.owner_id),
                "username": u.username,
                "avatar_url": u.avatar_url,
                "passes": h.passes,
                "purchased_at": h.purchased_at.isoformat() if h.purchased_at else None,
            })

    profile = RunnerProfileData(
        id=str(user.id),
        username=user.username,
        avatarUrl=user.avatar_url,
        headerImageUrl=user.header_image_url,
        bio=user.bio,
        wallet_address=user.wallet_address,
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
        viewer=ViewerRelationship(
            state=relationship_state,
            is_authenticated=is_authenticated,
            is_friendpass_holder=is_friendpass_holder,
            friendpass_count=int(friendpass_count),
            can_buy_friendpass=can_buy,
            can_sell_friendpass=can_sell,
        ),
        teaser=TeaserContent(
            locked_pois_count=locked_pois_count,
            locked_routes_count=locked_routes_count,
            locked_messages_count=3 if relationship_state == "guest" else 0,  # Teaser count
            has_bonding_curve=token_status == "bonding_curve",
        ),
        unlocked=UnlockedContent(
            pois=unlocked_pois,
            routes=unlocked_routes,
            messages=unlocked_messages,
            bonding_curve_visible=relationship_state in ("friend", "owner"),
            friendpass_holders=friendpass_holders_list,
        ),
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


# ─── Multi-wallet management ──────────────────────────────────────────────────

from models import Wallet as WalletModel  # noqa: E402 (local import to avoid circular deps)


class AddWalletIn(BaseModel):
    wallet_address: str
    wallet_type: str = "ethereum"


@router.get("/me/wallets")
async def list_my_wallets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all wallet addresses linked to the authenticated user."""
    result = await db.execute(
        select(WalletModel)
        .where(WalletModel.user_id == current_user.id)
        .order_by(WalletModel.created_at)
    )
    wallets = result.scalars().all()
    return [
        {
            "id": str(w.id),
            "wallet_address": w.wallet_address,
            "wallet_type": w.wallet_type,
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w in wallets
    ]


@router.post("/me/wallets")
async def add_wallet(
    body: AddWalletIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link an additional wallet address to the authenticated user."""
    # Basic format check for Ethereum addresses
    if body.wallet_type == "ethereum":
        if not re.match(r"^0x[0-9a-fA-F]{40}$", body.wallet_address):
            raise HTTPException(status_code=422, detail="Invalid Ethereum wallet address")

    # Check for duplicate
    existing = await db.execute(
        select(WalletModel).where(WalletModel.wallet_address == body.wallet_address.lower())
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Wallet address already linked")

    wallet = WalletModel(
        user_id=current_user.id,
        wallet_address=body.wallet_address.lower(),
        wallet_type=body.wallet_type,
    )
    db.add(wallet)
    await db.commit()
    await db.refresh(wallet)
    return {
        "id": str(wallet.id),
        "wallet_address": wallet.wallet_address,
        "wallet_type": wallet.wallet_type,
        "created_at": wallet.created_at.isoformat() if wallet.created_at else None,
    }


@router.delete("/me/wallets/{wallet_id}")
async def remove_wallet(
    wallet_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a linked wallet from the authenticated user's account."""
    result = await db.execute(
        select(WalletModel).where(
            WalletModel.id == wallet_id,
            WalletModel.user_id == current_user.id,
        )
    )
    wallet = result.scalar_one_or_none()
    if wallet is None:
        raise HTTPException(status_code=404, detail="Wallet not found")
    await db.delete(wallet)
    await db.commit()
    return {"status": "deleted"}


@router.get("/leaderboard")
async def get_user_leaderboard(
    q: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Return top runners by reputation score, optionally filtered by username prefix.
    Includes both onboarded users and users with admin/ancient_owner roles.
    """
    # Sub-query: user IDs that have admin or ancient_owner roles
    from models import UserRole, ACLRole
    admin_ids_sq = (
        select(UserRole.user_id)
        .join(ACLRole, UserRole.role_id == ACLRole.id)
        .where(ACLRole.role_name.in_(["admin", "ancient_owner"]))
        .scalar_subquery()
    )
    query = select(User).where(
        (User.onboarding_completed == True) | (User.id.in_(admin_ids_sq))
    )
    if q:
        query = query.where(User.username.ilike(f"%{q}%"))
    query = query.order_by(User.reputation_score.desc()).limit(min(limit, 100))
    result = await db.execute(query)
    users = result.scalars().all()
    return [
        {
            "id": str(u.id),
            "username": u.username,
            "avatar_url": u.avatar_url,
            "reputation_score": u.reputation_score or 0.0,
        }
        for u in users
    ]


# ── Full Runner Profile Endpoint ─────────────────────────────────────────────

DEFAULT_TGE_DISTRIBUTION = {
    "runner": 30,
    "friends": 20,
    "tippers": 20,
    "founders": 10,
    "ancient": 10,
    "dao": 5,
    "site": 5,
}

DEFAULT_TGE_TOTAL_SUPPLY = 1_000_000


async def _get_admin_config(db: AsyncSession, key: str, default: Any) -> Any:
    result = await db.execute(
        select(AdminConfig).where(AdminConfig.config_key == key)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return default
    val = row.config_value
    if isinstance(val, str):
        import json
        try:
            return json.loads(val)
        except Exception:
            return val
    return val


@router.get("/runner/{username}/full-profile")
async def get_full_runner_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
    viewer: User | None = Depends(optional_current_user),
):
    """
    Comprehensive runner profile. Returns:
    - Runner info + reputation + global valuation
    - TokenPool status + TGE config + distribution breakdown
    - FriendPass info + whether viewer is a friend
    - POIs (full details for friends/owner, teaser for others)
    - Routes (full for friends/owner, teaser for others)
    - Own holdings if viewer is the runner
    """
    user_result = await db.execute(
        select(User).where(User.username == username.lower())
    )
    runner = user_result.scalar_one_or_none()
    if not runner:
        raise HTTPException(status_code=404, detail=f"Runner '{username}' not found")

    runner_id = runner.id
    viewer_id = viewer.id if viewer else None
    is_owner = viewer_id is not None and str(viewer_id) == str(runner_id)

    # ── Is viewer a friend (holds this runner's FriendPass)? ──
    is_friend = False
    viewer_pass_holding = None
    if viewer_id and not is_owner:
        holding_result = await db.execute(
            select(FriendPassHolding).where(
                FriendPassHolding.owner_id == viewer_id,
                FriendPassHolding.runner_id == runner_id,
                FriendPassHolding.sold == False,
            ).limit(1)
        )
        viewer_pass_holding = holding_result.scalar_one_or_none()
        is_friend = viewer_pass_holding is not None

    # ── Token Pool ──
    pool_result = await db.execute(
        select(TokenPool).where(TokenPool.runner_id == runner_id).limit(1)
    )
    pool = pool_result.scalar_one_or_none()
    current_supply = int(pool.current_supply) if pool else 0
    liquidity_pool = float(pool.liquidity_pool) if pool else 0.0
    threshold = float(pool.threshold) if pool else 10.0
    tge_progress_pct = min(100, int((liquidity_pool / max(threshold, 0.0001)) * 100))

    # ── Bonding curve price at current supply ──
    BASE = 0.001
    K = 0.0001
    token_price_eth = BASE + K * (current_supply ** 2)

    # ── FriendPass info ──
    pass_sold = await db.scalar(
        select(func.count(FriendPassHolding.id)).where(
            FriendPassHolding.runner_id == runner_id,
            FriendPassHolding.sold == False,
        )
    ) or 0
    fp_price_eth = FRIENDPASS_BASE_PRICE_ETH + FRIENDPASS_SLOPE_ETH * int(pass_sold)
    fp_price_fiat = fp_price_eth * ETH_USD_RATE
    pass_holder_count = await db.scalar(
        select(func.count(func.distinct(FriendPassHolding.owner_id))).where(
            FriendPassHolding.runner_id == runner_id,
            FriendPassHolding.sold == False,
        )
    ) or 0

    # ── Global valuation ──
    token_market_cap = token_price_eth * max(current_supply, 1)
    friendpass_market_cap = fp_price_eth * int(pass_sold)
    rep_value = float(runner.reputation_score or 0) * 0.001
    global_valuation_eth = token_market_cap + friendpass_market_cap + rep_value
    global_valuation_usd = global_valuation_eth * ETH_USD_RATE

    # ── TGE config from AdminConfig ──
    tge_distribution = await _get_admin_config(db, "tge_distribution", DEFAULT_TGE_DISTRIBUTION)
    tge_total_supply = await _get_admin_config(db, "tge_total_supply", DEFAULT_TGE_TOTAL_SUPPLY)
    bonding_curve_type = await _get_admin_config(db, "bonding_curve_type", "quadratic")
    tge_threshold_config = await _get_admin_config(db, "tge_threshold", threshold)

    # Tokens per group
    def tokens_for(pct: int) -> int:
        return int((pct / 100) * int(tge_total_supply))

    tge_breakdown = {
        k: {"pct": v, "tokens": tokens_for(v)}
        for k, v in (tge_distribution if isinstance(tge_distribution, dict) else DEFAULT_TGE_DISTRIBUTION).items()
    }

    # ── POIs (owned by runner) ──
    poi_result = await db.execute(
        select(POI).where(POI.owner_id == runner_id)
        .order_by(POI.minted_at.desc())
        .limit(20)
    )
    pois_raw = poi_result.scalars().all()

    def _serialize_poi(p: POI, full: bool) -> dict:
        base = {
            "id": str(p.id),
            "name": p.name if full else p.name[:3] + "…",
            "rarity": p.rarity,
            "latitude": round(p.latitude, full and 6 or 2),
            "longitude": round(p.longitude, full and 6 or 2),
            "locked": not full,
        }
        if full:
            base["description"] = p.description
        return base

    can_see_pois = is_owner or is_friend
    # Guests see up to 2 teasers
    pois_visible = pois_raw[:2] if not can_see_pois else pois_raw
    pois_out = [_serialize_poi(p, can_see_pois) for p in pois_visible]
    pois_total = len(pois_raw)

    # ── Routes (created by runner) ──
    route_result = await db.execute(
        select(Route).where(Route.creator_id == runner_id)
        .order_by(Route.created_at.desc())
        .limit(20)
    )
    routes_raw = route_result.scalars().all()

    def _serialize_route(r: Route, full: bool) -> dict:
        base = {
            "id": str(r.id),
            "name": r.name if full else r.name[:3] + "…",
            "difficulty": r.difficulty,
            "distance_km": r.distance_km if full else None,
            "completion_count": r.completion_count,
            "locked": not full,
        }
        if full:
            base["description"] = r.description
            base["elevation_gain_m"] = r.elevation_gain_m
            base["estimated_duration_min"] = r.estimated_duration_min
        return base

    can_see_routes = is_owner or is_friend
    routes_visible = routes_raw[:2] if not can_see_routes else routes_raw
    routes_out = [_serialize_route(r, can_see_routes) for r in routes_visible]
    routes_total = len(routes_raw)

    # ── Viewer's own holdings for this runner (if owner) ──
    owner_holdings = None
    if is_owner:
        # My FriendPass holders
        fp_holders_result = await db.execute(
            select(FriendPassHolding, User)
            .join(User, User.id == FriendPassHolding.owner_id)
            .where(
                FriendPassHolding.runner_id == runner_id,
                FriendPassHolding.sold == False,
            )
            .order_by(FriendPassHolding.purchased_at.asc())
        )
        fp_holders = [
            {
                "owner_id": str(h.owner_id),
                "username": u.username,
                "avatar_url": u.avatar_url,
                "passes": h.passes,
                "since": h.purchased_at.isoformat() if h.purchased_at else None,
            }
            for h, u in fp_holders_result.all()
        ]

        # My token buyers (top 10 tippers)
        tippers_result = await db.execute(
            select(
                TokenTransaction.buyer_id,
                func.sum(TokenTransaction.price).label("total"),
                User.username, User.avatar_url,
            )
            .join(User, User.id == TokenTransaction.buyer_id)
            .where(TokenTransaction.runner_id == runner_id)
            .group_by(TokenTransaction.buyer_id, User.username, User.avatar_url)
            .order_by(func.sum(TokenTransaction.price).desc())
            .limit(10)
        )
        tippers = [
            {
                "owner_id": str(row.buyer_id),
                "username": row.username,
                "avatar_url": row.avatar_url,
                "total_tipped_eth": f"{float(row.total):.6f}",
            }
            for row in tippers_result.all()
        ]

        owner_holdings = {
            "friendpass_holders": fp_holders,
            "top_tippers": tippers,
            "token_supply": current_supply,
            "liquidity_pool_eth": f"{liquidity_pool:.6f}",
        }

    # ── Rank ──
    rank = await _get_runner_rank(db, runner_id)

    # ── Viewer's FriendPass holdings of this runner (if logged in) ──
    viewer_friendpass = None
    if viewer_id and not is_owner:
        viewer_friendpass = {
            "is_friend": is_friend,
            "holding_id": str(viewer_pass_holding.id) if viewer_pass_holding else None,
            "passes": viewer_pass_holding.passes if viewer_pass_holding else 0,
        }

    return {
        # Runner info
        "id": str(runner.id),
        "username": runner.username,
        "avatar_url": runner.avatar_url,
        "header_image_url": runner.header_image_url,
        "bio": runner.bio,
        "location": runner.location,
        "reputation_score": round(float(runner.reputation_score or 0), 2),
        "rank": rank,
        "is_owner": is_owner,
        # Valuation
        "global_valuation": {
            "eth": f"{global_valuation_eth:.6f}",
            "usd": f"${global_valuation_usd:,.2f}",
            "token_market_cap_eth": f"{token_market_cap:.6f}",
            "friendpass_market_cap_eth": f"{friendpass_market_cap:.6f}",
        },
        # Token / TGE
        "token": {
            "current_supply": current_supply,
            "current_price_eth": f"{token_price_eth:.6f}",
            "current_price_usd": f"${token_price_eth * ETH_USD_RATE:.4f}",
            "liquidity_pool_eth": f"{liquidity_pool:.6f}",
            "tge_threshold_eth": f"{tge_threshold_config:.2f}",
            "tge_progress_pct": tge_progress_pct,
            "bonding_curve_type": bonding_curve_type,
            "tge_breakdown": tge_breakdown,
            "tge_total_supply": int(tge_total_supply),
        },
        # FriendPass
        "friendpass": {
            "current_price_eth": f"{fp_price_eth:.6f}",
            "current_price_usd": f"${fp_price_fiat:.2f}",
            "passes_sold": int(pass_sold),
            "max_supply": FRIENDPASS_MAX_SUPPLY,
            "holder_count": int(pass_holder_count),
        },
        # Viewer context
        "viewer_friendpass": viewer_friendpass,
        # Content (friend-gated)
        "pois": pois_out,
        "pois_total": pois_total,
        "pois_locked_count": max(0, pois_total - len(pois_out)),
        "routes": routes_out,
        "routes_total": routes_total,
        "routes_locked_count": max(0, routes_total - len(routes_out)),
        "content_locked": not can_see_pois,
        # Owner-only data
        "owner_data": owner_holdings,
    }

