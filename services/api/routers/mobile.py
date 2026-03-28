"""Mobile companion app endpoints — step sync, health sync."""
import logging
from datetime import datetime, date

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from database import get_db
from models import User, Step
from dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Request / Response schemas ──

class StepSyncRequest(BaseModel):
    steps: int
    period_start: str
    period_end: str
    source: str


class StepSyncResponse(BaseModel):
    message: str
    daily_total: int


class HealthSyncRequest(BaseModel):
    steps: int
    distance_meters: float
    calories_burned: float
    period_start: str
    period_end: str
    source: str


class HealthSyncResponse(BaseModel):
    message: str


class DeviceTokenRequest(BaseModel):
    token: str
    platform: str


class DeviceTokenResponse(BaseModel):
    message: str


# ── POST /steps/sync ──

@router.post("/steps/sync", response_model=StepSyncResponse)
async def sync_steps(
    payload: StepSyncRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    x_device_attestation: str | None = Header(None),
):
    """Accept step data from the mobile app and return the daily total."""
    logger.info(
        "steps/sync user=%s steps=%d source=%s attestation=%s",
        user.id, payload.steps, payload.source, x_device_attestation,
    )

    # Persist step record
    step = Step(
        user_id=user.id,
        step_count=payload.steps,
        recorded_at=datetime.utcnow(),
    )
    db.add(step)
    await db.flush()

    # Calculate daily total
    today_start = datetime.combine(date.today(), datetime.min.time())
    result = await db.execute(
        select(func.coalesce(func.sum(Step.step_count), 0)).where(
            Step.user_id == user.id,
            Step.recorded_at >= today_start,
        )
    )
    daily_total = int(result.scalar())

    return StepSyncResponse(message="Steps synced", daily_total=daily_total)


# ── POST /health/sync ──

@router.post("/health/sync", response_model=HealthSyncResponse)
async def sync_health(
    payload: HealthSyncRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    x_device_attestation: str | None = Header(None),
):
    """Accept health data from the mobile app (Apple Health / Google Fit)."""
    logger.info(
        "health/sync user=%s steps=%d distance=%.1f cal=%.1f source=%s attestation=%s",
        user.id, payload.steps, payload.distance_meters,
        payload.calories_burned, payload.source, x_device_attestation,
    )

    # Store step portion using existing Step model
    step = Step(
        user_id=user.id,
        step_count=payload.steps,
        recorded_at=datetime.utcnow(),
    )
    db.add(step)
    await db.flush()

    # NOTE: distance_meters and calories_burned are logged for now.
    # A dedicated health_data table can be added via migration when needed.

    return HealthSyncResponse(message="Health data synced")


# ── POST /users/me/device-token ──

@router.post("/users/me/device-token", response_model=DeviceTokenResponse)
async def register_device_token(
    payload: DeviceTokenRequest,
    user: User = Depends(get_current_user),
):
    """Register a device push notification token for the current user."""
    logger.info(
        "device-token/register user=%s platform=%s token=%s...",
        user.id, payload.platform, payload.token[:20] if payload.token else "",
    )
    # NOTE: For now, log the token. A dedicated device_tokens table can be added later.
    return DeviceTokenResponse(message="Device token registered")


# ── DELETE /users/me/device-token ──

@router.delete("/users/me/device-token", response_model=DeviceTokenResponse)
async def unregister_device_token(
    user: User = Depends(get_current_user),
):
    """Remove the stored device push notification token for the current user."""
    logger.info("device-token/unregister user=%s", user.id)
    # NOTE: For now, log the removal. A dedicated device_tokens table can be added later.
    return DeviceTokenResponse(message="Device token removed")


# ── GET /expo/status (public, no auth) ──

class ExpoPublicStatus(BaseModel):
    running: bool
    url: str


@router.get("/expo/status", response_model=ExpoPublicStatus)
async def expo_public_status():
    """Public endpoint to check if Expo Go dev server is running.
    Used by the web footer to conditionally show the QR code."""
    import json
    import subprocess

    try:
        result = subprocess.run(
            ["pm2", "jlist"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return ExpoPublicStatus(running=False, url="")

        processes = json.loads(result.stdout)
        for proc in processes:
            if proc.get("name") == "ontrail-expo":
                status = proc.get("pm2_env", {}).get("status", "")
                if status == "online":
                    return ExpoPublicStatus(running=True, url="https://expo.ontrail.tech")
        return ExpoPublicStatus(running=False, url="")
    except Exception:
        return ExpoPublicStatus(running=False, url="")
