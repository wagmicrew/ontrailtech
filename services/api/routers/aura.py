"""Aura API Router — runner aura data and leaderboards."""
import uuid as uuid_mod
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from models import (
    AuraIndex, AuraContribution, AncientHolder, User,
)
from redis_client import (
    cache_get, cache_set,
    TTL_AURA_SCORE, TTL_AURA_LEADERBOARD,
)
from engines.aura_serializer import deserialize_aura, serialize_aura

logger = logging.getLogger(__name__)

router = APIRouter()


# ── GET /aura/{runner_id} ──

@router.get("/{runner_id}")
async def get_runner_aura(runner_id: str, db: AsyncSession = Depends(get_db)):
    """Return a runner's aura data: totalAura, auraLevel, ancientSupporterCount,
    weightedAura, and list of Ancient supporters with contributions.

    Serves from Redis cache first, falls back to DB on miss.
    Returns 404 for invalid or non-existent runner_id.
    """
    try:
        rid = uuid_mod.UUID(runner_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Invalid runner_id")

    # Try Redis cache first
    cache_key = f"aura:{runner_id}"
    cached = await cache_get(cache_key)
    validated = deserialize_aura(cached) if cached else None

    if validated:
        # Cache hit with valid data
        supporters = await _get_supporters(db, rid)
        return {
            "totalAura": validated["total_aura"],
            "auraLevel": validated["aura_level"],
            "ancientSupporterCount": validated["ancient_supporter_count"],
            "weightedAura": validated["weighted_aura"],
            "supporters": supporters,
        }

    # Cache miss — query DB
    result = await db.execute(
        select(AuraIndex).where(AuraIndex.runner_id == rid)
    )
    aura = result.scalar_one_or_none()

    if aura is None:
        # Check if the runner exists at all
        user_result = await db.execute(select(User.id).where(User.id == rid))
        if user_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Runner not found")
        # Runner exists but has no aura data
        return {
            "totalAura": "0",
            "auraLevel": "None",
            "ancientSupporterCount": 0,
            "weightedAura": "0",
            "supporters": [],
        }

    # Re-cache the aura data using the serializer
    await cache_set(cache_key, serialize_aura(aura), TTL_AURA_SCORE)

    supporters = await _get_supporters(db, rid)

    return {
        "totalAura": str(aura.total_aura),
        "auraLevel": aura.aura_level,
        "ancientSupporterCount": aura.ancient_supporter_count,
        "weightedAura": str(aura.weighted_aura),
        "supporters": supporters,
    }


async def _get_supporters(db: AsyncSession, runner_id) -> list[dict]:
    """Fetch Ancient supporters with their individual contributions for a runner."""
    result = await db.execute(
        select(AuraContribution, AncientHolder.wallet_address).join(
            AncientHolder, AncientHolder.id == AuraContribution.ancient_holder_id
        ).where(AuraContribution.runner_id == runner_id)
    )
    rows = result.all()

    supporters = []
    for contrib, wallet_address in rows:
        # Try to find a username for this wallet
        user_result = await db.execute(
            select(User.username).where(User.wallet_address == wallet_address)
        )
        username = user_result.scalar_one_or_none()

        supporters.append({
            "walletAddress": wallet_address,
            "username": username,
            "holderWeight": str(contrib.holder_weight),
            "supportStrength": str(contrib.support_strength),
            "contribution": str(contrib.contribution),
        })

    return supporters


# ── GET /aura/leaderboard/runners ──

@router.get("/leaderboard/runners")
async def get_runner_leaderboard(db: AsyncSession = Depends(get_db)):
    """Top 100 runners by totalAura, cached 60s in Redis."""
    cache_key = "aura:leaderboard:runners"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    result = await db.execute(
        select(AuraIndex, User.username)
        .join(User, User.id == AuraIndex.runner_id)
        .where(AuraIndex.total_aura > 0)
        .order_by(AuraIndex.total_aura.desc())
        .limit(100)
    )
    rows = result.all()

    leaderboard = []
    for rank, (aura, username) in enumerate(rows, start=1):
        leaderboard.append({
            "rank": rank,
            "runnerId": str(aura.runner_id),
            "username": username,
            "totalAura": str(aura.total_aura),
            "auraLevel": aura.aura_level,
            "ancientSupporterCount": aura.ancient_supporter_count,
        })

    await cache_set(cache_key, leaderboard, TTL_AURA_LEADERBOARD)
    return leaderboard


# ── GET /aura/leaderboard/ancients ──

@router.get("/leaderboard/ancients")
async def get_ancient_leaderboard(db: AsyncSession = Depends(get_db)):
    """Top 100 Ancient holders by total influence contributed, cached 60s in Redis."""
    cache_key = "aura:leaderboard:ancients"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    # Sum contributions per ancient holder across all runners
    result = await db.execute(
        select(
            AncientHolder.id,
            AncientHolder.wallet_address,
            func.sum(AuraContribution.contribution).label("total_influence"),
            func.count(AuraContribution.runner_id).label("runners_supported"),
        )
        .join(AuraContribution, AuraContribution.ancient_holder_id == AncientHolder.id)
        .group_by(AncientHolder.id, AncientHolder.wallet_address)
        .order_by(func.sum(AuraContribution.contribution).desc())
        .limit(100)
    )
    rows = result.all()

    leaderboard = []
    for rank, row in enumerate(rows, start=1):
        # Try to find a username for this wallet
        user_result = await db.execute(
            select(User.username).where(User.wallet_address == row.wallet_address)
        )
        username = user_result.scalar_one_or_none()

        leaderboard.append({
            "rank": rank,
            "walletAddress": row.wallet_address,
            "username": username,
            "totalInfluence": str(row.total_influence),
            "runnersSupported": int(row.runners_supported),
        })

    await cache_set(cache_key, leaderboard, TTL_AURA_LEADERBOARD)
    return leaderboard
