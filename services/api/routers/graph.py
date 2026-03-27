"""Graph API Router — influence graph endpoints for node info, neighbors, and trending."""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, InfluenceEdge
from engines.influence_engine import get_node_with_neighbors, get_trending

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_RESPONSE_BYTES = 200 * 1024  # 200KB


async def _resolve_user_id(db: AsyncSession, username: str):
    """Look up a user by username, raise 404 if not found."""
    result = await db.execute(
        select(User.id).where(User.username == username.lower())
    )
    user_id = result.scalar_one_or_none()
    if user_id is None:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    return user_id


def _enforce_size_limit(data: dict) -> dict:
    """Check JSON-serialized size; trim neighbors/edges if over 200KB."""
    raw = json.dumps(data, default=str)
    if len(raw.encode("utf-8")) <= MAX_RESPONSE_BYTES:
        return data

    # Trim neighbors and edges to fit within limit
    if "neighbors" in data:
        while len(json.dumps(data, default=str).encode("utf-8")) > MAX_RESPONSE_BYTES and data["neighbors"]:
            data["neighbors"].pop()
    if "edges" in data:
        while len(json.dumps(data, default=str).encode("utf-8")) > MAX_RESPONSE_BYTES and data["edges"]:
            data["edges"].pop()
    return data


@router.get("/node/{username}")
async def get_graph_node(username: str, db: AsyncSession = Depends(get_db)):
    """Node info + max 20 neighbors. Cached 15s. Max 200KB response.

    Requirements: 20.1, 20.4
    """
    user_id = await _resolve_user_id(db, username)
    data = await get_node_with_neighbors(db, user_id, max_neighbors=20)
    data = _enforce_size_limit(data)
    return data


@router.get("/neighbors/{username}")
async def get_neighbors(
    username: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Connected nodes with edge weights, paginated.

    Requirements: 20.2, 27.2
    """
    user_id = await _resolve_user_id(db, username)

    # Outgoing edges (this user supports these runners)
    outgoing_q = (
        select(InfluenceEdge)
        .where(InfluenceEdge.from_user_id == user_id)
        .order_by(InfluenceEdge.weight.desc())
    )
    # Incoming edges (these users support this runner)
    incoming_q = (
        select(InfluenceEdge)
        .where(InfluenceEdge.to_runner_id == user_id)
        .order_by(InfluenceEdge.weight.desc())
    )

    outgoing_result = await db.execute(outgoing_q)
    incoming_result = await db.execute(incoming_q)

    all_edges = list(outgoing_result.scalars().all()) + list(incoming_result.scalars().all())

    # Deduplicate by collecting unique neighbor IDs
    seen = set()
    unique_edges = []
    for e in all_edges:
        neighbor_id = e.to_runner_id if e.from_user_id == user_id else e.from_user_id
        if neighbor_id not in seen and neighbor_id != user_id:
            seen.add(neighbor_id)
            unique_edges.append(e)

    total = len(unique_edges)
    page = unique_edges[offset : offset + limit]

    neighbors = []
    for e in page:
        neighbor_id = e.to_runner_id if e.from_user_id == user_id else e.from_user_id
        u_result = await db.execute(
            select(User.username, User.reputation_score).where(User.id == neighbor_id)
        )
        u_row = u_result.one_or_none()
        neighbors.append({
            "user_id": str(neighbor_id),
            "username": u_row[0] if u_row else None,
            "reputation_score": str(u_row[1] or 0) if u_row else "0",
            "edge_type": e.edge_type,
            "weight": str(e.weight),
        })

    return {
        "user_id": str(user_id),
        "neighbors": neighbors,
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/trending")
async def get_graph_trending(db: AsyncSession = Depends(get_db)):
    """Top aura growth + influence gain. Cached 60s.

    Requirements: 26.1, 26.3
    """
    data = await get_trending(db)
    return data
