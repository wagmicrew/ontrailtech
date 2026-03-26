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
                     metadata={"key": req.config_key, "value": req.config_value}))
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
            "metadata": log.metadata, "created_at": str(log.created_at),
        }
        for log in logs
    ]
