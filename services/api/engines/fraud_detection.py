"""Fraud Detection System - GPS validation and anti-cheat."""
import math
from typing import List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from models import FraudEvent, GPSPoint
from engines.map_engine import haversine

MAX_SPEED_KMH = 30.0
MAX_ACCURACY_M = 50.0
TELEPORT_DIST_KM = 1.0
TELEPORT_TIME_S = 10.0


def validate_gps_track(points: List[dict]) -> dict:
    """Validate GPS track for anomalies. Returns fraud check result."""
    if not points or len(points) < 2:
        return {"valid": True, "confidence": 1.0, "flags": []}

    flags = []
    for i in range(1, len(points)):
        prev, curr = points[i - 1], points[i]
        prev_ts = _parse_ts(prev["timestamp"])
        curr_ts = _parse_ts(curr["timestamp"])
        time_diff = (curr_ts - prev_ts).total_seconds()

        if time_diff <= 0:
            flags.append("route_discontinuity")
            continue

        dist_km = haversine(
            prev["latitude"], prev["longitude"],
            curr["latitude"], curr["longitude"],
        )
        speed_kmh = (dist_km / time_diff) * 3600

        if speed_kmh > MAX_SPEED_KMH:
            flags.append("impossible_speed")
        if dist_km > TELEPORT_DIST_KM and time_diff < TELEPORT_TIME_S:
            flags.append("teleportation")
        if curr.get("accuracy", 0) > MAX_ACCURACY_M:
            flags.append("gps_spoofing")

    confidence = max(0.0, 1.0 - (len(flags) / len(points)))
    unique_flags = list(set(flags))

    return {
        "valid": len(flags) == 0,
        "confidence": round(confidence, 3),
        "flags": unique_flags,
        "reason": f"Detected {len(flags)} anomalies" if flags else None,
    }


def _parse_ts(ts) -> datetime:
    if isinstance(ts, datetime):
        return ts
    if isinstance(ts, str):
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return datetime.utcnow()


async def record_fraud_event(
    db: AsyncSession, user_id, session_id, event_type: str,
    severity: str = "medium", metadata: dict = None,
):
    event = FraudEvent(
        user_id=user_id, session_id=session_id,
        event_type=event_type, severity=severity,
        event_metadata=metadata,
    )
    db.add(event)
    await db.flush()


async def get_fraud_score(db: AsyncSession, user_id) -> float:
    """Calculate fraud score from historical events. Higher = more suspicious."""
    severity_weights = {"low": 0.1, "medium": 0.3, "high": 0.7, "critical": 1.0}
    result = await db.execute(
        select(FraudEvent).where(FraudEvent.user_id == user_id)
    )
    events = result.scalars().all()
    if not events:
        return 0.0
    total = sum(severity_weights.get(e.severity, 0.3) for e in events)
    return min(1.0, total / 10.0)  # Normalize to 0-1
