"""
FriendPass Admin Router
Admin endpoints for FriendPass configuration, simulation, and management.
"""
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from database import get_db
from models import FriendPassConfig, FriendPassSimulation, ProfileWallet, User
from dependencies import require_admin
from friendpass_pricing import (
    FriendPassPricingCalculator,
    simulate_friendpass_config,
    calculate_friendpass_price as calculate_price,
)
from profile_wallet import (
    get_or_create_profile_wallet,
    fund_profile_wallet,
    list_all_profile_wallets,
)

router = APIRouter()


# ── Pydantic Models ──

class FriendPassConfigCreate(BaseModel):
    config_name: str
    base_price_eth: float
    slope_eth: float
    max_supply_per_runner: int
    max_per_wallet: int
    reputation_enabled: bool = True
    reputation_multiplier: float = 1.0
    reputation_base_threshold: float = 100.0
    tax_sitewallet_bps: int = 3000
    tax_profile_owner_bps: int = 4000
    tax_dao_bps: int = 2000
    tax_ancient_bps: int = 1000
    volatile_price_percentage: int = 60
    reputation_price_percentage: int = 40
    sell_enabled: bool = True
    sell_fee_bps: int = 500
    min_sell_price_eth: float = 0.0005
    chain_id: int = 137
    contract_address: Optional[str] = None
    description: Optional[str] = None


class FriendPassConfigUpdate(BaseModel):
    base_price_eth: Optional[float] = None
    slope_eth: Optional[float] = None
    max_supply_per_runner: Optional[int] = None
    max_per_wallet: Optional[int] = None
    reputation_enabled: Optional[bool] = None
    reputation_multiplier: Optional[float] = None
    reputation_base_threshold: Optional[float] = None
    tax_sitewallet_bps: Optional[int] = None
    tax_profile_owner_bps: Optional[int] = None
    tax_dao_bps: Optional[int] = None
    tax_ancient_bps: Optional[int] = None
    volatile_price_percentage: Optional[int] = None
    reputation_price_percentage: Optional[int] = None
    sell_enabled: Optional[bool] = None
    sell_fee_bps: Optional[int] = None
    min_sell_price_eth: Optional[float] = None
    chain_id: Optional[int] = None
    contract_address: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class SimulationRequest(BaseModel):
    config_name: str = "default"
    config_params: Dict[str, Any]
    runner_reputation: float = 0.0
    supply_sold: int = 0
    simulation_name: str = "Simulation"


class ProfileWalletCreateRequest(BaseModel):
    user_id: str
    chain_id: int = 137


class ProfileWalletFundRequest(BaseModel):
    user_id: str
    amount_matic: float
    chain_id: int = 137


# ── FriendPass Configuration Endpoints ──

@router.get("/friendpass/config")
async def get_friendpass_configs(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get all FriendPass configurations."""
    result = await db.execute(select(FriendPassConfig).order_by(FriendPassConfig.created_at.desc()))
    configs = result.scalars().all()
    
    return [
        {
            "id": str(c.id),
            "config_name": c.config_name,
            "base_price_eth": str(c.base_price_eth),
            "slope_eth": str(c.slope_eth),
            "max_supply_per_runner": c.max_supply_per_runner,
            "max_per_wallet": c.max_per_wallet,
            "reputation_enabled": c.reputation_enabled,
            "reputation_multiplier": str(c.reputation_multiplier),
            "reputation_base_threshold": c.reputation_base_threshold,
            "tax_sitewallet_bps": c.tax_sitewallet_bps,
            "tax_profile_owner_bps": c.tax_profile_owner_bps,
            "tax_dao_bps": c.tax_dao_bps,
            "tax_ancient_bps": c.tax_ancient_bps,
            "volatile_price_percentage": c.volatile_price_percentage,
            "reputation_price_percentage": c.reputation_price_percentage,
            "sell_enabled": c.sell_enabled,
            "sell_fee_bps": c.sell_fee_bps,
            "min_sell_price_eth": str(c.min_sell_price_eth),
            "chain_id": c.chain_id,
            "contract_address": c.contract_address,
            "description": c.description,
            "is_active": c.is_active,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in configs
    ]


@router.get("/friendpass/config/{config_name}")
async def get_friendpass_config(
    config_name: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific FriendPass configuration."""
    result = await db.execute(
        select(FriendPassConfig).where(FriendPassConfig.config_name == config_name)
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    return {
        "id": str(config.id),
        "config_name": config.config_name,
        "base_price_eth": str(config.base_price_eth),
        "slope_eth": str(config.slope_eth),
        "max_supply_per_runner": config.max_supply_per_runner,
        "max_per_wallet": config.max_per_wallet,
        "reputation_enabled": config.reputation_enabled,
        "reputation_multiplier": str(config.reputation_multiplier),
        "reputation_base_threshold": config.reputation_base_threshold,
        "tax_sitewallet_bps": config.tax_sitewallet_bps,
        "tax_profile_owner_bps": config.tax_profile_owner_bps,
        "tax_dao_bps": config.tax_dao_bps,
        "tax_ancient_bps": config.tax_ancient_bps,
        "volatile_price_percentage": config.volatile_price_percentage,
        "reputation_price_percentage": config.reputation_price_percentage,
        "sell_enabled": config.sell_enabled,
        "sell_fee_bps": config.sell_fee_bps,
        "min_sell_price_eth": str(config.min_sell_price_eth),
        "chain_id": config.chain_id,
        "contract_address": config.contract_address,
        "description": config.description,
        "is_active": config.is_active,
        "created_at": config.created_at.isoformat() if config.created_at else None,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }


@router.post("/friendpass/config")
async def create_friendpass_config(
    req: FriendPassConfigCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new FriendPass configuration."""
    # Check if config name already exists
    result = await db.execute(
        select(FriendPassConfig).where(FriendPassConfig.config_name == req.config_name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Configuration name already exists")
    
    # Validate tax structure totals
    if req.tax_sitewallet_bps + req.tax_profile_owner_bps + req.tax_dao_bps + req.tax_ancient_bps != 10000:
        raise HTTPException(
            status_code=400,
            detail="Tax basis points must sum to 10000"
        )
    
    # Validate price split totals
    if req.volatile_price_percentage + req.reputation_price_percentage != 100:
        raise HTTPException(
            status_code=400,
            detail="Price split percentages must sum to 100"
        )
    
    config = FriendPassConfig(
        config_name=req.config_name,
        base_price_eth=Decimal(str(req.base_price_eth)),
        slope_eth=Decimal(str(req.slope_eth)),
        max_supply_per_runner=req.max_supply_per_runner,
        max_per_wallet=req.max_per_wallet,
        reputation_enabled=req.reputation_enabled,
        reputation_multiplier=Decimal(str(req.reputation_multiplier)),
        reputation_base_threshold=req.reputation_base_threshold,
        tax_sitewallet_bps=req.tax_sitewallet_bps,
        tax_profile_owner_bps=req.tax_profile_owner_bps,
        tax_dao_bps=req.tax_dao_bps,
        tax_ancient_bps=req.tax_ancient_bps,
        volatile_price_percentage=req.volatile_price_percentage,
        reputation_price_percentage=req.reputation_price_percentage,
        sell_enabled=req.sell_enabled,
        sell_fee_bps=req.sell_fee_bps,
        min_sell_price_eth=Decimal(str(req.min_sell_price_eth)),
        chain_id=req.chain_id,
        contract_address=req.contract_address,
        description=req.description,
        is_active=True,
        created_by=user.id,
    )
    
    db.add(config)
    await db.commit()
    await db.refresh(config)
    
    return {
        "id": str(config.id),
        "config_name": config.config_name,
        "message": "Configuration created successfully",
    }


@router.patch("/friendpass/config/{config_name}")
async def update_friendpass_config(
    config_name: str,
    req: FriendPassConfigUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a FriendPass configuration."""
    result = await db.execute(
        select(FriendPassConfig).where(FriendPassConfig.config_name == config_name)
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    # Update fields if provided
    if req.base_price_eth is not None:
        config.base_price_eth = Decimal(str(req.base_price_eth))
    if req.slope_eth is not None:
        config.slope_eth = Decimal(str(req.slope_eth))
    if req.max_supply_per_runner is not None:
        config.max_supply_per_runner = req.max_supply_per_runner
    if req.max_per_wallet is not None:
        config.max_per_wallet = req.max_per_wallet
    if req.reputation_enabled is not None:
        config.reputation_enabled = req.reputation_enabled
    if req.reputation_multiplier is not None:
        config.reputation_multiplier = Decimal(str(req.reputation_multiplier))
    if req.reputation_base_threshold is not None:
        config.reputation_base_threshold = req.reputation_base_threshold
    
    # Validate tax structure if updating
    tax_fields = [
        req.tax_sitewallet_bps, req.tax_profile_owner_bps,
        req.tax_dao_bps, req.tax_ancient_bps
    ]
    if any(f is not None for f in tax_fields):
        current_bps = [
            config.tax_sitewallet_bps, config.tax_profile_owner_bps,
            config.tax_dao_bps, config.tax_ancient_bps
        ]
        new_bps = [
            req.tax_sitewallet_bps if req.tax_sitewallet_bps is not None else current_bps[0],
            req.tax_profile_owner_bps if req.tax_profile_owner_bps is not None else current_bps[1],
            req.tax_dao_bps if req.tax_dao_bps is not None else current_bps[2],
            req.tax_ancient_bps if req.tax_ancient_bps is not None else current_bps[3],
        ]
        if sum(new_bps) != 10000:
            raise HTTPException(
                status_code=400,
                detail="Tax basis points must sum to 10000"
            )
        config.tax_sitewallet_bps = new_bps[0]
        config.tax_profile_owner_bps = new_bps[1]
        config.tax_dao_bps = new_bps[2]
        config.tax_ancient_bps = new_bps[3]
    
    # Validate price split if updating
    if req.volatile_price_percentage is not None or req.reputation_price_percentage is not None:
        volatile = req.volatile_price_percentage if req.volatile_price_percentage is not None else config.volatile_price_percentage
        reputation = req.reputation_price_percentage if req.reputation_price_percentage is not None else config.reputation_price_percentage
        if volatile + reputation != 100:
            raise HTTPException(
                status_code=400,
                detail="Price split percentages must sum to 100"
            )
        config.volatile_price_percentage = volatile
        config.reputation_price_percentage = reputation
    
    if req.sell_enabled is not None:
        config.sell_enabled = req.sell_enabled
    if req.sell_fee_bps is not None:
        config.sell_fee_bps = req.sell_fee_bps
    if req.min_sell_price_eth is not None:
        config.min_sell_price_eth = Decimal(str(req.min_sell_price_eth))
    if req.chain_id is not None:
        config.chain_id = req.chain_id
    if req.contract_address is not None:
        config.contract_address = req.contract_address
    if req.description is not None:
        config.description = req.description
    if req.is_active is not None:
        config.is_active = req.is_active
    
    await db.commit()
    await db.refresh(config)
    
    return {"message": "Configuration updated successfully"}


@router.delete("/friendpass/config/{config_name}")
async def delete_friendpass_config(
    config_name: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a FriendPass configuration."""
    result = await db.execute(
        select(FriendPassConfig).where(FriendPassConfig.config_name == config_name)
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    if config.config_name == "default":
        raise HTTPException(status_code=400, detail="Cannot delete default configuration")
    
    await db.delete(config)
    await db.commit()
    
    return {"message": "Configuration deleted successfully"}


# ── Simulation Endpoints ──

@router.post("/friendpass/simulate")
async def simulate_friendpass(
    req: SimulationRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Run a FriendPass pricing simulation."""
    simulation = await simulate_friendpass_config(
        db=db,
        config_params=req.config_params,
        reputation=req.runner_reputation,
        supply_sold=req.supply_sold,
        simulation_name=req.simulation_name,
    )
    
    # Save simulation to database
    sim_record = FriendPassSimulation(
        simulation_name=req.simulation_name,
        config_params=req.config_params,
        runner_reputation=req.runner_reputation,
        supply_sold=req.supply_sold,
        price_eth=Decimal(simulation["results"]["total_revenue_eth"]),
        price_breakdown=simulation["results"]["purchases"],
        tax_distribution={},
        total_revenue_eth=Decimal(simulation["results"]["total_revenue_eth"]),
        created_by=user.id,
    )
    db.add(sim_record)
    await db.commit()
    
    return simulation


@router.get("/friendpass/simulations")
async def get_friendpass_simulations(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
    offset: int = 0,
):
    """Get all FriendPass simulations."""
    result = await db.execute(
        select(FriendPassSimulation)
        .order_by(FriendPassSimulation.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    simulations = result.scalars().all()
    
    return [
        {
            "id": str(s.id),
            "simulation_name": s.simulation_name,
            "config_params": s.config_params,
            "runner_reputation": s.runner_reputation,
            "supply_sold": s.supply_sold,
            "price_eth": str(s.price_eth),
            "total_revenue_eth": str(s.total_revenue_eth),
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in simulations
    ]


# ── Profile Wallet Endpoints ──

@router.get("/profile-wallets")
async def get_profile_wallets(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    chain_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
):
    """Get all profile wallets."""
    wallets = await list_all_profile_wallets(db, chain_id, limit, offset)
    return wallets


@router.post("/profile-wallets")
async def create_profile_wallet(
    req: ProfileWalletCreateRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a profile wallet for a user."""
    wallet = await get_or_create_profile_wallet(
        db=db,
        user_id=req.user_id,
        chain_id=req.chain_id,
        create_if_missing=True,
    )
    
    return {
        "id": str(wallet.id),
        "user_id": str(wallet.user_id),
        "wallet_address": wallet.wallet_address,
        "chain_id": wallet.chain_id,
        "message": "Profile wallet created successfully",
    }


@router.post("/profile-wallets/fund")
async def fund_wallet(
    req: ProfileWalletFundRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Fund a profile wallet with MATIC."""
    result = await fund_profile_wallet(
        db=db,
        user_id=req.user_id,
        amount_matic=req.amount_matic,
        chain_id=req.chain_id,
    )
    
    return result


@router.get("/friendpass/price-calculate")
async def calculate_friendpass_price_endpoint(
    supply: int,
    reputation: float = 0.0,
    config_name: str = "default",
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Calculate FriendPass price for given parameters."""
    price_data = await calculate_price(
        db=db,
        supply=supply,
        reputation=reputation,
        config_name=config_name,
    )
    
    return price_data
