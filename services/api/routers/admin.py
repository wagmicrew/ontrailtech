from datetime import datetime, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional, Dict, Any

from database import get_db
from models import AdminConfig, TokenSimulation, AuditLog, User, UserRole, ACLRole
from dependencies import require_admin
from redis_client import redis

router = APIRouter()


class UpdateConfigRequest(BaseModel):
    config_key: str
    config_value: Any


class SimulationRequest(BaseModel):
    simulation_name: str
    base_price: float = 0.001
    k: float = 0.0001
    investor_count: int = 100
    avg_investment: float = 1.0
    tge_threshold: float = 10.0


class UpdateAdminUserRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    roles: Optional[list[str]] = None


def _serialize_user(user: User, roles: list[str]) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "wallet_address": user.wallet_address,
        "roles": roles,
        "reputation_score": float(user.reputation_score or 0.0),
        "onboarding_completed": bool(user.onboarding_completed),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


async def _get_roles_by_user_ids(db: AsyncSession, user_ids: list[Any]) -> dict[str, list[str]]:
    if not user_ids:
        return {}

    result = await db.execute(
        select(UserRole.user_id, ACLRole.role_name)
        .join(ACLRole, UserRole.role_id == ACLRole.id)
        .where(UserRole.user_id.in_(user_ids))
    )

    roles_by_user: dict[str, list[str]] = {str(user_id): [] for user_id in user_ids}
    for user_id, role_name in result.all():
        roles_by_user.setdefault(str(user_id), []).append(role_name)
    return roles_by_user


async def _get_refresh_sessions_for_user(user_id: str) -> list[dict[str, Any]]:
    sessions = []
    async for key in redis.scan_iter(match="refresh_token:*"):
        token_user_id = await redis.get(key)
        if token_user_id != user_id:
            continue

        token = key.split(":", 1)[1]
        ttl = await redis.ttl(key)
        expires_at = None
        if ttl and ttl > 0:
            expires_at = (datetime.now(timezone.utc) + timedelta(seconds=ttl)).isoformat()

        sessions.append(
            {
                "id": token,
                "token_hash": token,
                "ip_address": None,
                "created_at": None,
                "expires_at": expires_at,
            }
        )

    return sessions


@router.get("/users")
async def get_admin_users(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
    offset: int = 0,
    q: str | None = None,
):
    limit = max(1, min(limit, 100))
    offset = max(offset, 0)

    stmt = select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                User.username.ilike(pattern),
                User.email.ilike(pattern),
                User.wallet_address.ilike(pattern),
            )
        )

    result = await db.execute(stmt)
    users = list(result.scalars().all())
    roles_by_user = await _get_roles_by_user_ids(db, [user.id for user in users])
    return [_serialize_user(record, roles_by_user.get(str(record.id), [])) for record in users]


@router.patch("/users/{user_id}")
async def update_admin_user(
    user_id: str,
    req: UpdateAdminUserRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if req.username is not None:
        username = req.username.strip() or None
        if username:
            existing = await db.execute(select(User).where(User.username == username, User.id != target.id))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Username already in use")
        target.username = username

    if req.email is not None:
        email = req.email.strip().lower() or None
        if email:
            existing = await db.execute(select(User).where(User.email == email, User.id != target.id))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Email already in use")
        target.email = email

    if req.roles is not None:
        normalized_roles = sorted({role.strip() for role in req.roles if role and role.strip()})
        if normalized_roles:
            role_result = await db.execute(select(ACLRole).where(ACLRole.role_name.in_(normalized_roles)))
            role_rows = list(role_result.scalars().all())
            role_map = {role.role_name: role for role in role_rows}
            missing_roles = [role_name for role_name in normalized_roles if role_name not in role_map]
            if missing_roles:
                raise HTTPException(status_code=400, detail=f"Unknown roles: {', '.join(missing_roles)}")
        else:
            role_rows = []

        await db.execute(delete(UserRole).where(UserRole.user_id == target.id))
        for role in role_rows:
            db.add(UserRole(user_id=target.id, role_id=role.id))

    db.add(AuditLog(
        user_id=user.id,
        action="admin_user_updated",
        resource_type="user",
        resource_id=str(target.id),
        event_metadata={
            "username": target.username,
            "email": target.email,
            "roles": req.roles,
        },
    ))
    await db.flush()

    roles_by_user = await _get_roles_by_user_ids(db, [target.id])
    return _serialize_user(target, roles_by_user.get(str(target.id), []))


@router.delete("/users/{user_id}")
async def delete_admin_user(
    user_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if str(target.id) == str(user.id):
        raise HTTPException(status_code=400, detail="You cannot delete your own account from the admin panel")

    await db.execute(delete(UserRole).where(UserRole.user_id == target.id))

    async for key in redis.scan_iter(match="refresh_token:*"):
        token_user_id = await redis.get(key)
        if token_user_id == str(target.id):
            await redis.delete(key)

    try:
        await db.delete(target)
        db.add(AuditLog(
            user_id=user.id,
            action="admin_user_deleted",
            resource_type="user",
            resource_id=user_id,
        ))
        await db.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="User cannot be deleted because related records still exist",
        )

    return {"status": "deleted", "id": user_id}


@router.get("/users/{user_id}/sessions")
async def get_admin_user_sessions(
    user_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User.id).where(User.id == user_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="User not found")
    return await _get_refresh_sessions_for_user(user_id)


@router.delete("/sessions/{session_id}")
async def revoke_admin_session(
    session_id: str,
    user: User = Depends(require_admin),
):
    await redis.delete(f"refresh_token:{session_id}")
    return {"status": "revoked", "id": session_id}


@router.post("/config")
async def update_config(
    req: UpdateConfigRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AdminConfig).where(AdminConfig.config_key == req.config_key))
    config = result.scalar_one_or_none()
    if config:
        config.config_value = req.config_value
        config.updated_by = user.id
    else:
        config = AdminConfig(config_key=req.config_key, config_value=req.config_value, updated_by=user.id)
        db.add(config)

    db.add(AuditLog(user_id=user.id, action="config_update", resource_type="admin_config",
                     event_metadata={"key": req.config_key, "value": req.config_value}))
    await db.flush()
    return {"status": "updated", "key": req.config_key}


@router.post("/simulate")
async def run_simulation(
    req: SimulationRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    base = Decimal(str(req.base_price))
    k = Decimal(str(req.k))
    supply = 0
    pool = Decimal(0)

    for _ in range(req.investor_count):
        shares = max(1, int(req.avg_investment / float(base + k * Decimal(supply ** 2))))
        cost = Decimal(0)
        for j in range(shares):
            cost += base + k * Decimal((supply + j) ** 2)
        pool += cost
        supply += shares

    tge_reached = float(pool) >= req.tge_threshold
    final_price = float(base + k * Decimal(supply ** 2))

    results = {
        "final_supply": supply,
        "pool_size": float(pool),
        "tge_reached": tge_reached,
        "final_price": final_price,
    }

    sim = TokenSimulation(
        simulation_name=req.simulation_name,
        parameters={
            "base_price": req.base_price, "k": req.k,
            "investor_count": req.investor_count,
            "avg_investment": req.avg_investment,
            "tge_threshold": req.tge_threshold,
        },
        results=results,
    )
    db.add(sim)
    await db.flush()
    return {"simulation_id": str(sim.id), **results}


@router.get("/audit-logs")
async def get_audit_logs(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id), "user_id": str(log.user_id) if log.user_id else None,
            "action": log.action, "resource_type": log.resource_type,
            "metadata": log.event_metadata, "created_at": str(log.created_at),
        }
        for log in logs
    ]


# ── Site Settings ──

@router.get("/settings")
async def get_all_settings(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from models import SiteSetting
    result = await db.execute(select(SiteSetting).order_by(SiteSetting.setting_key))
    settings = result.scalars().all()
    return [
        {
            "id": str(s.id), "key": s.setting_key, "value": s.setting_value,
            "description": s.description, "updated_at": str(s.updated_at),
        }
        for s in settings
    ]


class UpdateSettingRequest(BaseModel):
    setting_key: str
    setting_value: str


@router.post("/settings")
async def update_setting(
    req: UpdateSettingRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from models import SiteSetting
    from redis_client import cache_delete
    result = await db.execute(select(SiteSetting).where(SiteSetting.setting_key == req.setting_key))
    setting = result.scalar_one_or_none()
    if setting:
        setting.setting_value = req.setting_value
        setting.updated_by = user.id
    else:
        setting = SiteSetting(
            setting_key=req.setting_key, setting_value=req.setting_value, updated_by=user.id,
        )
        db.add(setting)

    db.add(AuditLog(
        user_id=user.id, action="setting_update", resource_type="site_settings",
        event_metadata={"key": req.setting_key, "value": req.setting_value},
    ))
    await db.flush()
    # Invalidate cache
    await cache_delete(f"setting:{req.setting_key}")
    return {"status": "updated", "key": req.setting_key}


# ── Aura Config ──

AURA_CONFIG_KEYS = {
    "nft_multiplier",
    "aura_boost_factor",
    "max_aura_boost",
    "max_aura_multiplier",
    "max_aura_factor",
    "ancient_multiplier",
    "min_reputation_threshold",
    "max_contribution_percentile",
}


class UpdateAuraConfigRequest(BaseModel):
    value: Any


@router.put("/aura-config/{config_key}")
async def update_aura_config(
    config_key: str,
    req: UpdateAuraConfigRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if config_key not in AURA_CONFIG_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown aura config key: {config_key}")

    from redis_client import cache_delete

    result = await db.execute(select(AdminConfig).where(AdminConfig.config_key == config_key))
    config = result.scalar_one_or_none()
    if config:
        config.config_value = req.value
        config.updated_by = user.id
    else:
        config = AdminConfig(config_key=config_key, config_value=req.value, updated_by=user.id)
        db.add(config)

    db.add(AuditLog(
        user_id=user.id,
        action="aura_config_updated",
        resource_type="admin_config",
        resource_id=config_key,
        event_metadata={"key": config_key, "value": req.value},
    ))
    await db.flush()

    await cache_delete("aura:config")

    return {"status": "updated", "key": config_key, "value": req.value}


# ── Public settings endpoint (non-sensitive keys for frontend) ──

@router.get("/public-settings")
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """Returns non-sensitive settings needed by the frontend."""
    from models import SiteSetting
    public_keys = [
        "privy_app_id",
        "walletconnect_project_id",
        "site_name",
        "site_tagline",
        "mapbox_token",
        "google_client_id",
        "google_web_client_id",
        "google_ios_client_id",
        "google_android_client_id",
        "google_expo_client_id",
    ]
    result = await db.execute(
        select(SiteSetting).where(SiteSetting.setting_key.in_(public_keys))
    )
    settings = result.scalars().all()
    return {s.setting_key: s.setting_value for s in settings}
