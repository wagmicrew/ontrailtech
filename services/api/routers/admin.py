from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, Dict, Any

from database import get_db
from models import AdminConfig, TokenSimulation, AuditLog, User
from dependencies import require_admin

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


# ── Public settings endpoint (non-sensitive keys for frontend) ──

@router.get("/public-settings")
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """Returns non-sensitive settings needed by the frontend."""
    from models import SiteSetting
    public_keys = ["privy_app_id", "walletconnect_project_id", "site_name", "site_tagline", "mapbox_token"]
    result = await db.execute(
        select(SiteSetting).where(SiteSetting.setting_key.in_(public_keys))
    )
    settings = result.scalars().all()
    return {s.setting_key: s.setting_value for s in settings}
