"""Loss Notification Engine — detects rank drops, overtakes, streak risks."""
import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models import User, UserNotification
from redis_client import cache_get, cache_set

logger = logging.getLogger(__name__)

CHECK_INTERVAL = 300  # 5 minutes
MAX_LOSS_NOTIFICATIONS_PER_DAY = 3
RANK_DROP_THRESHOLD = 3
STREAK_WARNING_HOURS = 4


async def _get_rank_snapshot() -> dict[str, int]:
    """Get current rank snapshot: {user_id: rank}."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User.id, User.reputation_score)
            .order_by(User.reputation_score.desc())
        )
        ranks = {}
        for i, (uid, _) in enumerate(result.all(), 1):
            ranks[str(uid)] = i
        return ranks


async def _get_previous_snapshot() -> dict[str, int]:
    """Load previous rank snapshot from Redis."""
    data = await cache_get("rank_snapshot:previous")
    return data or {}


async def _save_snapshot(snapshot: dict[str, int]) -> None:
    """Save current snapshot as previous."""
    await cache_set("rank_snapshot:previous", snapshot, 600)


async def _count_recent_loss_notifications(db: AsyncSession, user_id, hours: int = 24) -> int:
    """Count loss notifications sent to user in last N hours."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    count = await db.scalar(
        select(func.count(UserNotification.id)).where(
            UserNotification.user_id == user_id,
            UserNotification.type.in_(["passed_by", "rank_drop", "streak_risk"]),
            UserNotification.created_at >= cutoff,
        )
    )
    return count or 0


async def check_rank_changes() -> None:
    """Compare current ranks to previous snapshot, create notifications."""
    current = await _get_rank_snapshot()
    previous = await _get_previous_snapshot()

    if not previous:
        await _save_snapshot(current)
        return

    async with AsyncSessionLocal() as db:
        for user_id, current_rank in current.items():
            prev_rank = previous.get(user_id)
            if prev_rank is None:
                continue

            # Rate limit check
            recent_count = await _count_recent_loss_notifications(db, user_id)
            if recent_count >= MAX_LOSS_NOTIFICATIONS_PER_DAY:
                continue

            rank_change = current_rank - prev_rank  # positive = dropped

            # Passed by notification
            if rank_change > 0 and rank_change < RANK_DROP_THRESHOLD:
                import uuid as uuid_mod
                db.add(UserNotification(
                    user_id=uuid_mod.UUID(user_id),
                    type="passed_by",
                    message=f"Someone passed you! You're now rank #{current_rank}",
                    urgency="normal",
                    action_url="/boost",
                ))

            # Rank drop notification (3+ positions)
            elif rank_change >= RANK_DROP_THRESHOLD:
                import uuid as uuid_mod
                db.add(UserNotification(
                    user_id=uuid_mod.UUID(user_id),
                    type="rank_drop",
                    message=f"You dropped {rank_change} ranks to #{current_rank}. Time to boost!",
                    urgency="high",
                    action_url="/boost",
                ))

        await db.commit()

    await _save_snapshot(current)


async def run_loss_notifications() -> None:
    """Main loop — runs every CHECK_INTERVAL seconds."""
    logger.info("Loss notification engine started")
    while True:
        try:
            await check_rank_changes()
        except Exception as e:
            logger.error(f"Loss notification error: {e}")
        await asyncio.sleep(CHECK_INTERVAL)
