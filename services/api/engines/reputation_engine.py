"""Reputation Engine - weighted reputation scoring based on activity and network."""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from models import (
    User, POI, RouteNFT, Friend, RunnerToken, ReputationEvent, AdminConfig,
    AncientHolder, AuraContribution, Wallet,
)
from redis_client import cache_get, cache_set, TTL_REP_WEIGHTS
from engines.aura_engine import enqueue_recalculation, get_reputation_aura_factor, get_aura_config

logger = logging.getLogger(__name__)

DEFAULT_WEIGHTS = {
    "poi_weight": 10.0,
    "route_weight": 25.0,
    "friend_weight": 0.1,
    "token_weight": 0.001,
}


async def get_reputation_weights(db: AsyncSession) -> dict:
    cached = await cache_get("reputation_weights")
    if cached:
        return cached
    result = await db.execute(
        select(AdminConfig).where(AdminConfig.config_key == "reputation_weights")
    )
    config = result.scalar_one_or_none()
    weights = config.config_value if config else DEFAULT_WEIGHTS
    await cache_set("reputation_weights", weights, TTL_REP_WEIGHTS)
    return weights


async def calculate_reputation(db: AsyncSession, user_id) -> dict:
    weights = await get_reputation_weights(db)

    # POI score
    poi_count = await db.scalar(
        select(func.count(POI.id)).where(POI.owner_id == user_id)
    ) or 0
    poi_score = poi_count * weights.get("poi_weight", 10.0)

    # Route score
    route_count = await db.scalar(
        select(func.count(RouteNFT.id)).where(RouteNFT.user_id == user_id)
    ) or 0
    route_score = route_count * weights.get("route_weight", 25.0)

    # Friend network score
    friends_result = await db.execute(
        select(Friend.friend_id).where(Friend.user_id == user_id)
    )
    friend_ids = [r[0] for r in friends_result.all()]
    friend_score = 0.0
    for fid in friend_ids:
        friend_rep = await db.scalar(
            select(User.reputation_score).where(User.id == fid)
        ) or 0.0
        friend_score += friend_rep * weights.get("friend_weight", 0.1)

    # Token impact score
    token_score = 0.0
    tokens_result = await db.execute(
        select(RunnerToken).where(
            RunnerToken.runner_id == user_id,
            RunnerToken.status == "launched",
        )
    )
    for token in tokens_result.scalars().all():
        token_score += float(token.bonding_curve_pool or 0) * weights.get("token_weight", 0.001)

    total = max(0.0, poi_score + route_score + friend_score + token_score)

    return {
        "total": round(total, 2),
        "components": {
            "pois_owned": round(poi_score, 2),
            "routes_completed": round(route_score, 2),
            "friend_network": round(friend_score, 2),
            "token_impact": round(token_score, 2),
        },
    }


async def record_reputation_event(
    db: AsyncSession, user_id, event_type: str, weight: float, metadata: dict = None
):
    """Record a reputation event and update user score.
    
    Enforces:
    - Monotonicity: positive events never decrease score
    - Floor: score never below 0.0
    - Each event includes event_type, weight, optional event_metadata
    """
    event = ReputationEvent(
        user_id=user_id, event_type=event_type,
        weight=weight, event_metadata=metadata,
    )
    db.add(event)

    # Update user's cached reputation score
    user = await db.get(User, user_id)
    if user:
        old_score = user.reputation_score or 0.0
        breakdown = await calculate_reputation(db, user_id)
        new_score = breakdown["total"]

        # Apply aura factor: amplify reputation gain for runners with non-zero aura
        # (Requirement 7.1, 7.2)
        try:
            aura_factor = await get_reputation_aura_factor(db, user_id)
            if aura_factor > 0:
                # Multiply the gain (delta) by (1 + auraFactor)
                gain = new_score - old_score
                if gain > 0:
                    amplified_gain = gain * float(1 + aura_factor)
                    new_score = old_score + amplified_gain

            # Apply ancientMultiplier for runners who are also Ancient holders
            # (Requirement 7.3)
            wallet_result_anc = await db.execute(
                select(Wallet.wallet_address).where(Wallet.user_id == user_id)
            )
            wallet_addrs = [r[0] for r in wallet_result_anc.all()]
            is_ancient_holder = False
            if wallet_addrs:
                anc_count = await db.scalar(
                    select(func.count(AncientHolder.id)).where(
                        AncientHolder.wallet_address.in_(wallet_addrs),
                        AncientHolder.is_active == True,  # noqa: E712
                    )
                )
                is_ancient_holder = (anc_count or 0) > 0

            if is_ancient_holder:
                config = await get_aura_config(db)
                ancient_multiplier = float(config.get("ancient_multiplier", 1.2))
                new_score = new_score * ancient_multiplier
        except Exception:
            logger.warning(
                "Failed to apply aura factor to reputation for user %s",
                user_id, exc_info=True,
            )

        # Monotonicity: positive events never decrease score
        if weight > 0:
            new_score = max(new_score, old_score)

        # Floor: score never below 0.0 (Requirement 7.5)
        user.reputation_score = max(0.0, new_score)

    await db.flush()

    # Enqueue aura recalculation for this runner (affected by reputation change)
    # (Requirement 7.1 — aura-backed runners trigger recalc on rep update)
    try:
        await enqueue_recalculation(user_id)
    except Exception:
        logger.warning(
            "Failed to enqueue aura recalculation for runner %s after reputation update",
            user_id, exc_info=True,
        )

    # Aura recalculation: if this user is an active Ancient holder,
    # enqueue recalc for every runner they support (Requirement 3.4)
    try:
        wallet_result = await db.execute(
            select(Wallet.wallet_address).where(Wallet.user_id == user_id)
        )
        wallet_addresses = [r[0] for r in wallet_result.all()]

        if wallet_addresses:
            holder_result = await db.execute(
                select(AncientHolder.id).where(
                    AncientHolder.wallet_address.in_(wallet_addresses),
                    AncientHolder.is_active == True,
                )
            )
            holder_ids = [r[0] for r in holder_result.all()]

            if holder_ids:
                contrib_result = await db.execute(
                    select(AuraContribution.runner_id)
                    .where(AuraContribution.ancient_holder_id.in_(holder_ids))
                    .distinct()
                )
                runner_ids = [r[0] for r in contrib_result.all()]

                for runner_id in runner_ids:
                    await enqueue_recalculation(runner_id)
    except Exception:
        logger.warning("Failed to enqueue aura recalculations after reputation change for user %s", user_id, exc_info=True)
