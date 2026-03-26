"""Referral generation, stats, and influence graph endpoints."""
import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta

from database import get_db
from models import User, Referral, ReferralReward, ReputationEvent, FriendShareModel
from dependencies import get_current_user

router = APIRouter()

REFERRAL_CONVERSION_REP_WEIGHT = 20.0
REFERRAL_REWARD_PERCENT = 0.05  # 5% of FriendPass activity


class ReferralGenerateResponse(BaseModel):
    referral_link: str
    referral_code: str


class ReferralStatsResponse(BaseModel):
    total_referrals: int
    active_referrals: int
    reputation_earned: float
    rewards_earned: str


class InfluenceNode(BaseModel):
    userId: str
    username: Optional[str]
    avatar: Optional[str]
    level: int
    joinedAt: str
    friendPassesBought: int
    reputationScore: float
    isActive: bool


class InfluenceGraphResponse(BaseModel):
    totalNetworkSize: int
    directReferrals: int
    networkValue: str
    growthRate: float
    influenceScore: float
    nodes: list[InfluenceNode]


@router.post("/generate", response_model=ReferralGenerateResponse)
async def generate_referral(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate or return existing referral link. Idempotent — same user gets same code."""
    # Check if user already has a referral code (stored as a referral where they are referrer with no referred)
    existing = await db.execute(
        select(Referral).where(
            Referral.referrer_id == user.id,
            Referral.referred_id == None,
        ).limit(1)
    )
    existing_ref = existing.scalar_one_or_none()

    if existing_ref:
        code = existing_ref.referral_code
    else:
        code = secrets.token_urlsafe(12)
        ref = Referral(
            referrer_id=user.id,
            referred_id=None,
            referral_code=code,
            status="active",
        )
        db.add(ref)
        await db.flush()

    link = f"{user.username}.ontrail.tech" if user.username and not user.username.startswith("user_") else f"app.ontrail.tech?ref={code}"

    return ReferralGenerateResponse(referral_link=link, referral_code=code)


@router.get("/stats/{user_id}", response_model=ReferralStatsResponse)
async def get_referral_stats(user_id: str, db: AsyncSession = Depends(get_db)):
    """Return referral stats for a user."""
    import uuid as uuid_mod
    try:
        uid = uuid_mod.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")

    total = await db.scalar(
        select(func.count(Referral.id)).where(
            Referral.referrer_id == uid,
            Referral.referred_id != None,
        )
    ) or 0

    active = await db.scalar(
        select(func.count(Referral.id)).where(
            Referral.referrer_id == uid,
            Referral.referred_id != None,
            Referral.status.in_(["registered", "converted"]),
        )
    ) or 0

    rep_earned = await db.scalar(
        select(func.sum(ReputationEvent.weight)).where(
            ReputationEvent.user_id == uid,
            ReputationEvent.event_type.in_(["referral_signup", "referral_conversion"]),
        )
    ) or 0.0

    rewards = await db.scalar(
        select(func.sum(ReferralReward.amount)).where(ReferralReward.referrer_id == uid)
    ) or 0

    return ReferralStatsResponse(
        total_referrals=int(total),
        active_referrals=int(active),
        reputation_earned=float(rep_earned),
        rewards_earned=f"{float(rewards):.6f}",
    )


@router.get("/influence/{user_id}", response_model=InfluenceGraphResponse)
async def get_influence_graph(user_id: str, db: AsyncSession = Depends(get_db)):
    """Return influence graph data for a user."""
    import uuid as uuid_mod
    try:
        uid = uuid_mod.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")

    cutoff_active = datetime.utcnow() - timedelta(days=7)

    # Get direct referrals
    referrals_result = await db.execute(
        select(Referral, User).join(User, User.id == Referral.referred_id).where(
            Referral.referrer_id == uid,
            Referral.referred_id != None,
            Referral.status.in_(["registered", "converted"]),
        )
    )
    referrals = referrals_result.all()

    nodes = []
    total_value = 0.0
    for ref, referred_user in referrals:
        fp_count = await db.scalar(
            select(func.count(FriendShareModel.id)).where(FriendShareModel.owner_id == referred_user.id)
        ) or 0
        fp_value = await db.scalar(
            select(func.sum(FriendShareModel.purchase_price)).where(FriendShareModel.owner_id == referred_user.id)
        ) or 0
        total_value += float(fp_value)

        is_active = referred_user.updated_at and referred_user.updated_at >= cutoff_active

        nodes.append(InfluenceNode(
            userId=str(referred_user.id),
            username=referred_user.username,
            avatar=None,
            level=1,
            joinedAt=referred_user.created_at.isoformat() if referred_user.created_at else "",
            friendPassesBought=int(fp_count),
            reputationScore=round(referred_user.reputation_score or 0.0, 2),
            isActive=bool(is_active),
        ))

    direct_count = len(nodes)
    user_rep = await db.scalar(select(User.reputation_score).where(User.id == uid)) or 0.0

    return InfluenceGraphResponse(
        totalNetworkSize=direct_count,
        directReferrals=direct_count,
        networkValue=f"{total_value:.6f}",
        growthRate=0.0,
        influenceScore=round(float(user_rep), 2),
        nodes=nodes,
    )
