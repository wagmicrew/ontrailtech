"""Reputation Engine - weighted reputation scoring based on activity and network."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from models import (
    User, POI, RouteNFT, Friend, RunnerToken, ReputationEvent, AdminConfig
)
from redis_client import cache_get, cache_set, TTL_REP_WEIGHTS

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

        # Monotonicity: positive events never decrease score
        if weight > 0:
            new_score = max(new_score, old_score)

        # Floor: score never below 0.0
        user.reputation_score = max(0.0, new_score)

    await db.flush()
