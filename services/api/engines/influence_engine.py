"""Influence Graph Engine — influence score calculation and graph queries."""
import logging
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    InfluenceNode, InfluenceEdge, AncientHolder, AuraIndex, User, AdminConfig,
)
from redis_client import cache_get, cache_set, TTL_GRAPH_NODE, TTL_GRAPH_TRENDING

logger = logging.getLogger(__name__)

ANCIENT_INFLUENCE_MULTIPLIER = Decimal("1.25")
DEFAULT_EDGE_CAP = Decimal("1000")


async def _get_edge_cap(db: AsyncSession) -> Decimal:
    """Read per-edge contribution cap from admin_config, default 1000."""
    result = await db.execute(
        select(AdminConfig.config_value).where(
            AdminConfig.config_key == "influence_edge_cap"
        )
    )
    row = result.scalar_one_or_none()
    if row is not None:
        return Decimal(str(row))
    return DEFAULT_EDGE_CAP


async def _get_aura_multiplier(db: AsyncSession, user_id: UUID) -> Decimal:
    """Get aura-based multiplier for a user. Returns 1 + (totalAura / 100)."""
    result = await db.execute(
        select(AuraIndex.total_aura).where(AuraIndex.runner_id == user_id)
    )
    total_aura = result.scalar_one_or_none()
    if total_aura is None or Decimal(str(total_aura)) == 0:
        return Decimal("1")
    return Decimal("1") + Decimal(str(total_aura)) / Decimal("100")


async def _is_ancient(db: AsyncSession, user_id: UUID) -> bool:
    """Check if user is an active Ancient holder via their wallet address."""
    user_result = await db.execute(select(User.wallet_address).where(User.id == user_id))
    wallet = user_result.scalar_one_or_none()
    if not wallet:
        return False
    holder_result = await db.execute(
        select(AncientHolder.id).where(
            AncientHolder.wallet_address == wallet.lower(),
            AncientHolder.is_active == True,  # noqa: E712
        )
    )
    return holder_result.scalar_one_or_none() is not None


async def calculate_influence(db: AsyncSession, user_id: UUID) -> Decimal:
    """Calculate influence score for a user.

    influence = Σ incoming_edge_weights × auraMultiplier
    Ancient holders get an additional 1.25× multiplier.
    Per-edge contribution is capped via admin_config.
    """
    edge_cap = await _get_edge_cap(db)
    aura_mult = await _get_aura_multiplier(db, user_id)

    # Sum incoming edge weights (edges where this user is the target)
    result = await db.execute(
        select(InfluenceEdge.weight).where(InfluenceEdge.to_runner_id == user_id)
    )
    weights = result.scalars().all()

    total = Decimal("0")
    for w in weights:
        capped = min(Decimal(str(w)), edge_cap)
        total += capped

    influence = total * aura_mult

    # Ancient holders get additional multiplier
    if await _is_ancient(db, user_id):
        influence *= ANCIENT_INFLUENCE_MULTIPLIER

    return influence


async def upsert_edge(
    db: AsyncSession,
    from_user_id: UUID,
    to_runner_id: UUID,
    edge_type: str,
    weight: Decimal,
) -> None:
    """Upsert an influence edge. Accumulates weight on existing edges of the same type."""
    result = await db.execute(
        select(InfluenceEdge).where(
            and_(
                InfluenceEdge.from_user_id == from_user_id,
                InfluenceEdge.to_runner_id == to_runner_id,
                InfluenceEdge.edge_type == edge_type,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.weight = Decimal(str(existing.weight)) + Decimal(str(weight))
        existing.updated_at = datetime.utcnow()
    else:
        db.add(InfluenceEdge(
            from_user_id=from_user_id,
            to_runner_id=to_runner_id,
            edge_type=edge_type,
            weight=weight,
        ))

    # Ensure influence nodes exist for both users
    await _ensure_node(db, from_user_id)
    await _ensure_node(db, to_runner_id)

    await db.flush()


async def _ensure_node(db: AsyncSession, user_id: UUID) -> None:
    """Ensure an InfluenceNode exists for the given user."""
    result = await db.execute(
        select(InfluenceNode.id).where(InfluenceNode.user_id == user_id)
    )
    if result.scalar_one_or_none() is not None:
        return

    # Fetch user data for node creation
    user_result = await db.execute(
        select(User.reputation_score, User.wallet_address).where(User.id == user_id)
    )
    user_row = user_result.one_or_none()
    rep = Decimal(str(user_row[0] or 0)) if user_row else Decimal("0")
    wallet = user_row[1] if user_row else None

    # Check aura score
    aura_result = await db.execute(
        select(AuraIndex.total_aura).where(AuraIndex.runner_id == user_id)
    )
    aura = aura_result.scalar_one_or_none() or Decimal("0")

    # Check ancient status
    is_ancient = False
    if wallet:
        ah_result = await db.execute(
            select(AncientHolder.id).where(
                AncientHolder.wallet_address == wallet.lower(),
                AncientHolder.is_active == True,  # noqa: E712
            )
        )
        is_ancient = ah_result.scalar_one_or_none() is not None

    db.add(InfluenceNode(
        user_id=user_id,
        reputation_score=rep,
        aura_score=Decimal(str(aura)),
        is_ancient=is_ancient,
    ))


async def get_node_with_neighbors(
    db: AsyncSession, user_id: UUID, max_neighbors: int = 20
) -> dict:
    """Return node info + immediate neighbors for graph visualization.

    Cached in Redis with TTL_GRAPH_NODE (15s).
    """
    cache_key = f"graph:node:{user_id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    # Get the node
    node_result = await db.execute(
        select(InfluenceNode).where(InfluenceNode.user_id == user_id)
    )
    node = node_result.scalar_one_or_none()

    # Get user info
    user_result = await db.execute(
        select(User.username, User.reputation_score).where(User.id == user_id)
    )
    user_row = user_result.one_or_none()

    node_info = {
        "user_id": str(user_id),
        "username": user_row[0] if user_row else None,
        "reputation_score": str(node.reputation_score) if node else "0",
        "aura_score": str(node.aura_score) if node else "0",
        "is_ancient": node.is_ancient if node else False,
    }

    # Get outgoing edges (user supports these runners)
    outgoing = await db.execute(
        select(InfluenceEdge).where(
            InfluenceEdge.from_user_id == user_id
        ).order_by(InfluenceEdge.weight.desc()).limit(max_neighbors)
    )
    outgoing_edges = outgoing.scalars().all()

    # Get incoming edges (these users support this runner)
    incoming = await db.execute(
        select(InfluenceEdge).where(
            InfluenceEdge.to_runner_id == user_id
        ).order_by(InfluenceEdge.weight.desc()).limit(max_neighbors)
    )
    incoming_edges = incoming.scalars().all()

    # Collect unique neighbor IDs
    neighbor_ids = set()
    for e in outgoing_edges:
        neighbor_ids.add(e.to_runner_id)
    for e in incoming_edges:
        neighbor_ids.add(e.from_user_id)
    neighbor_ids.discard(user_id)

    # Fetch neighbor info (limited to max_neighbors)
    neighbor_list = list(neighbor_ids)[:max_neighbors]
    neighbors = []
    if neighbor_list:
        for nid in neighbor_list:
            n_user = await db.execute(
                select(User.username, User.reputation_score).where(User.id == nid)
            )
            n_row = n_user.one_or_none()
            n_node = await db.execute(
                select(InfluenceNode).where(InfluenceNode.user_id == nid)
            )
            n_node_obj = n_node.scalar_one_or_none()
            neighbors.append({
                "user_id": str(nid),
                "username": n_row[0] if n_row else None,
                "reputation_score": str(n_node_obj.reputation_score) if n_node_obj else "0",
                "aura_score": str(n_node_obj.aura_score) if n_node_obj else "0",
                "is_ancient": n_node_obj.is_ancient if n_node_obj else False,
            })

    edges = []
    for e in list(outgoing_edges) + list(incoming_edges):
        edges.append({
            "from_user_id": str(e.from_user_id),
            "to_runner_id": str(e.to_runner_id),
            "edge_type": e.edge_type,
            "weight": str(e.weight),
        })

    result_data = {
        "node": node_info,
        "neighbors": neighbors,
        "edges": edges,
    }

    await cache_set(cache_key, result_data, TTL_GRAPH_NODE)
    return result_data


async def get_trending(db: AsyncSession) -> dict:
    """Top aura growth + influence gain for discovery.

    Prioritizes recent growth over static ranking by ordering
    aura_index by updated_at desc (most recently changed first).
    Cached in Redis with TTL_GRAPH_TRENDING (60s).
    """
    cache_key = "graph:trending"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    # Top aura growth: runners with highest aura, ordered by most recent update
    aura_result = await db.execute(
        select(AuraIndex, User.username).join(
            User, User.id == AuraIndex.runner_id
        ).where(
            AuraIndex.total_aura > 0
        ).order_by(
            AuraIndex.updated_at.desc(),
            AuraIndex.total_aura.desc(),
        ).limit(20)
    )
    aura_rows = aura_result.all()

    top_aura = []
    for aura_idx, username in aura_rows:
        top_aura.append({
            "runner_id": str(aura_idx.runner_id),
            "username": username,
            "total_aura": str(aura_idx.total_aura),
            "aura_level": aura_idx.aura_level,
            "updated_at": aura_idx.updated_at.isoformat() if aura_idx.updated_at else None,
        })

    # Top influence gain: users with highest incoming edge weight sums
    influence_result = await db.execute(
        select(
            InfluenceEdge.to_runner_id,
            func.sum(InfluenceEdge.weight).label("total_weight"),
        ).group_by(
            InfluenceEdge.to_runner_id
        ).order_by(
            func.sum(InfluenceEdge.weight).desc()
        ).limit(20)
    )
    influence_rows = influence_result.all()

    top_influence = []
    for runner_id, total_weight in influence_rows:
        u_result = await db.execute(
            select(User.username).where(User.id == runner_id)
        )
        uname = u_result.scalar_one_or_none()
        top_influence.append({
            "runner_id": str(runner_id),
            "username": uname,
            "total_influence": str(total_weight),
        })

    result_data = {
        "top_aura_growth": top_aura,
        "top_influence": top_influence,
    }

    await cache_set(cache_key, result_data, TTL_GRAPH_TRENDING)
    return result_data
