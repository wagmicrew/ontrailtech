"""Runner-specific endpoints — token progress, dashboard, FriendPass status, notifications, cards."""
import uuid as uuid_mod
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from database import get_db
from models import (
    User, RunnerToken, TokenPool, TokenTransaction, FriendShareModel,
    ReputationEvent, UserNotification, ShareableCard,
)
from dependencies import get_current_user
from redis_client import cache_get, cache_set

router = APIRouter()


# ── Task 18: Token Progress ──

class TokenProgressResponse(BaseModel):
    tokenStatus: str
    progressPercent: int
    totalTips: str
    userContribution: str
    tgeThreshold: str
    supporterCount: int
    momentum: str


@router.get("/{runner_id}/token-progress", response_model=TokenProgressResponse)
async def get_token_progress(
    runner_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        rid = uuid_mod.UUID(runner_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Runner not found")

    token_result = await db.execute(
        select(RunnerToken).where(RunnerToken.runner_id == rid).order_by(RunnerToken.created_at.desc()).limit(1)
    )
    token = token_result.scalar_one_or_none()
    token_status = token.status if token else "bonding_curve"

    pool_result = await db.execute(select(TokenPool).where(TokenPool.runner_id == rid).limit(1))
    pool = pool_result.scalar_one_or_none()
    threshold = float(pool.threshold) if pool and pool.threshold else 1.0
    liquidity = float(pool.liquidity_pool) if pool and pool.liquidity_pool else 0.0

    progress = min(100, int((liquidity / threshold) * 100)) if threshold > 0 else 0

    total_tips = await db.scalar(
        select(func.sum(TokenTransaction.price)).where(TokenTransaction.runner_id == rid)
    ) or 0

    user_contribution = await db.scalar(
        select(func.sum(TokenTransaction.price)).where(
            TokenTransaction.runner_id == rid, TokenTransaction.buyer_id == user.id
        )
    ) or 0

    supporter_count = await db.scalar(
        select(func.count(func.distinct(FriendShareModel.owner_id))).where(FriendShareModel.runner_id == rid)
    ) or 0

    momentum = "near_launch" if progress > 75 else "surging" if progress >= 40 else "building"

    return TokenProgressResponse(
        tokenStatus=token_status,
        progressPercent=progress,
        totalTips=f"{float(total_tips):.6f}",
        userContribution=f"{float(user_contribution):.6f}",
        tgeThreshold=f"{threshold:.6f}",
        supporterCount=int(supporter_count),
        momentum=momentum,
    )


# ── Task 11: FriendPass Status ──

class FriendPassStatusResponse(BaseModel):
    friendPassNumber: int
    totalSupply: int
    percentile: int
    confirmed: bool


@router.get("/friendpass/status/{tx_hash}", response_model=FriendPassStatusResponse)
async def get_friendpass_status(tx_hash: str, db: AsyncSession = Depends(get_db)):
    """Return FriendPass status by tx hash. Optimistic if not yet indexed."""
    result = await db.execute(
        select(TokenTransaction).where(TokenTransaction.tx_hash == tx_hash)
    )
    tx = result.scalar_one_or_none()

    if tx:
        total = await db.scalar(
            select(func.count(FriendShareModel.id)).where(FriendShareModel.runner_id == tx.runner_id)
        ) or 1
        # Find this user's position
        position = await db.scalar(
            select(func.count(FriendShareModel.id)).where(
                FriendShareModel.runner_id == tx.runner_id,
                FriendShareModel.purchased_at <= tx.created_at,
            )
        ) or 1
        percentile = max(1, int((position / total) * 100))
        return FriendPassStatusResponse(
            friendPassNumber=int(position), totalSupply=int(total),
            percentile=percentile, confirmed=True,
        )

    # Not yet indexed — return optimistic data
    return FriendPassStatusResponse(
        friendPassNumber=0, totalSupply=0, percentile=0, confirmed=False,
    )


# ── Task 19: Dashboard Aggregated ──

class DashboardResponse(BaseModel):
    reputation: dict
    supporters: dict
    tokenProgress: dict
    friendPasses: dict
    streakDays: int
    rankChange: int
    nearbyPois: int


@router.get("/dashboard/progress", response_model=DashboardResponse)
async def get_dashboard_progress(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"dashboard:{user.id}"
    cached = await cache_get(cache_key)
    if cached:
        return DashboardResponse(**cached)

    # Reputation
    user_rep = user.reputation_score or 0.0
    higher = await db.scalar(
        select(func.count(User.id)).where(User.reputation_score > user_rep)
    ) or 0
    total_users = await db.scalar(select(func.count(User.id))) or 1
    rank = int(higher) + 1
    percentile = max(1, int(((total_users - rank) / total_users) * 100))

    # Supporters
    supporter_count = await db.scalar(
        select(func.count(func.distinct(FriendShareModel.owner_id))).where(FriendShareModel.runner_id == user.id)
    ) or 0

    # FriendPass holdings
    fp_held = await db.scalar(
        select(func.count(FriendShareModel.id)).where(FriendShareModel.owner_id == user.id)
    ) or 0
    fp_value = await db.scalar(
        select(func.sum(FriendShareModel.purchase_price)).where(FriendShareModel.owner_id == user.id)
    ) or 0

    data = {
        "reputation": {"score": round(user_rep, 2), "rank": rank, "percentile": percentile},
        "supporters": {"count": int(supporter_count), "trend": "stable"},
        "tokenProgress": {"runnersSupported": 0, "totalInvested": "0", "estimatedValue": "0"},
        "friendPasses": {"held": int(fp_held), "totalValue": f"{float(fp_value):.6f}"},
        "streakDays": 0,
        "rankChange": 0,
        "nearbyPois": 0,
    }

    await cache_set(cache_key, data, 60)
    return DashboardResponse(**data)


# ── Task 25: Notifications ──

class NotificationItem(BaseModel):
    id: str
    type: str
    message: str
    urgency: str
    action_url: Optional[str]
    read: bool
    created_at: str


class NotificationsResponse(BaseModel):
    notifications: list[NotificationItem]
    unread_count: int


@router.get("/notifications", response_model=NotificationsResponse)
async def get_notifications(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserNotification).where(UserNotification.user_id == user.id)
        .order_by(UserNotification.created_at.desc()).limit(20)
    )
    notifs = result.scalars().all()

    items = [
        NotificationItem(
            id=str(n.id), type=n.type, message=n.message,
            urgency=n.urgency, action_url=n.action_url,
            read=n.read, created_at=n.created_at.isoformat() if n.created_at else "",
        )
        for n in notifs
    ]
    unread = sum(1 for n in notifs if not n.read)

    return NotificationsResponse(notifications=items, unread_count=unread)


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        nid = uuid_mod.UUID(notification_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Notification not found")

    result = await db.execute(
        select(UserNotification).where(UserNotification.id == nid, UserNotification.user_id == user.id)
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.read = True
    await db.flush()
    return {"ok": True}


# ── Task 23: Shareable Cards ──

class CardGenerateRequest(BaseModel):
    card_type: str
    headline: str
    data: dict


class CardGenerateResponse(BaseModel):
    card_id: str
    image_url: str


@router.post("/cards/generate", response_model=CardGenerateResponse)
async def generate_card(
    req: CardGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = ShareableCard(
        user_id=user.id,
        type=req.card_type,
        headline=req.headline,
        image_url="",  # Generated async
        share_count=0,
        click_count=0,
    )
    db.add(card)
    await db.flush()

    # TODO: Generate actual OG image async (PIL/Pillow or external service)
    card.image_url = f"https://api.ontrail.tech/api/cards/{card.id}"

    return CardGenerateResponse(card_id=str(card.id), image_url=card.image_url)


@router.get("/api/cards/{card_id}")
async def get_card_image(card_id: str, db: AsyncSession = Depends(get_db)):
    """Serve OG image for a shareable card. TODO: return actual PNG."""
    try:
        cid = uuid_mod.UUID(card_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Card not found")

    result = await db.execute(select(ShareableCard).where(ShareableCard.id == cid))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    card.click_count = (card.click_count or 0) + 1
    await db.flush()

    # TODO: Return actual PNG image
    return {"card_id": str(card.id), "headline": card.headline, "image_url": card.image_url}
