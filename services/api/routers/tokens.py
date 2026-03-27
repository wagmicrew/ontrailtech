import logging
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from database import get_db
from models import RunnerToken, FriendShareModel, TokenPool, TokenTransaction, ReputationEvent, User, AncientHolder
from dependencies import get_current_user
from engines.aura_engine import enqueue_recalculation, get_effective_supply, get_effective_tips, get_aura_boost
from engines.influence_engine import upsert_edge

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_BASE_PRICE = Decimal("0.001")
DEFAULT_K = Decimal("0.0001")


def bonding_curve_price(supply: int, amount: int, base: Decimal, k: Decimal) -> Decimal:
    total = Decimal(0)
    for i in range(amount):
        s = supply + i
        total += base + k * Decimal(s ** 2)
    return total


class BuySharesRequest(BaseModel):
    runner_id: str
    amount: int


class SellSharesRequest(BaseModel):
    runner_id: str
    amount: int


class PriceQuoteResponse(BaseModel):
    total_cost: str
    current_supply: int
    price_per_share: str


class TransactionResponse(BaseModel):
    tx_hash: str | None
    amount: int
    price: str


async def _is_ancient_holder(db: AsyncSession, wallet_address: str) -> bool:
    """Check if a wallet address belongs to an active Ancient NFT holder."""
    if not wallet_address:
        return False
    result = await db.execute(
        select(AncientHolder).where(
            AncientHolder.wallet_address == wallet_address.lower(),
            AncientHolder.is_active == True,
        )
    )
    return result.scalar_one_or_none() is not None


@router.get("/price/{runner_id}", response_model=PriceQuoteResponse)
async def get_price_quote(runner_id: str, amount: int = 1, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TokenPool).where(TokenPool.runner_id == runner_id))
    pool = result.scalar_one_or_none()
    current_supply = int(pool.current_supply) if pool else 0

    # Use aura-adjusted effective supply for pricing (Task 8.1)
    effective_supply = await get_effective_supply(db, runner_id, current_supply)
    total = bonding_curve_price(effective_supply, amount, DEFAULT_BASE_PRICE, DEFAULT_K)
    per_share = total / amount if amount > 0 else Decimal(0)
    return PriceQuoteResponse(
        total_cost=str(total), current_supply=current_supply, price_per_share=str(per_share),
    )


@router.post("/buy", response_model=TransactionResponse)
async def buy_shares(
    req: BuySharesRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if str(user.id) == req.runner_id:
        raise HTTPException(status_code=400, detail="Cannot buy your own shares")
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    result = await db.execute(select(TokenPool).where(TokenPool.runner_id == req.runner_id))
    pool = result.scalar_one_or_none()
    if not pool:
        pool = TokenPool(runner_id=req.runner_id, current_supply=0, liquidity_pool=0, threshold=Decimal("10"))
        db.add(pool)
        await db.flush()

    current_supply = int(pool.current_supply)

    # Use aura-adjusted effective supply for pricing (Task 8.1)
    effective_supply = await get_effective_supply(db, req.runner_id, current_supply)
    total_cost = bonding_curve_price(effective_supply, req.amount, DEFAULT_BASE_PRICE, DEFAULT_K)

    # Apply aura boost to token allocation (Task 8.2)
    aura_boost = await get_aura_boost(db, req.runner_id)
    allocated_amount = req.amount
    if aura_boost > 0:
        allocated_amount = int(req.amount * (1 + float(aura_boost)))
        logger.info(
            "Aura boost applied for runner %s: boost=%s, requested=%d, allocated=%d",
            req.runner_id, aura_boost, req.amount, allocated_amount,
        )

    # Record share with aura-boosted allocation
    share = FriendShareModel(
        owner_id=user.id, runner_id=req.runner_id,
        amount=allocated_amount, purchase_price=total_cost,
    )
    db.add(share)
    pool.current_supply = Decimal(current_supply + allocated_amount)
    pool.liquidity_pool = Decimal(pool.liquidity_pool) + total_cost

    tx = TokenTransaction(
        buyer_id=user.id, runner_id=req.runner_id,
        amount=allocated_amount, price=total_cost,
    )
    db.add(tx)
    await db.flush()

    # Trigger aura recalculation if trader is an Ancient holder
    if user.wallet_address and await _is_ancient_holder(db, user.wallet_address):
        try:
            await enqueue_recalculation(req.runner_id)
        except Exception:
            logger.warning("Failed to enqueue aura recalculation for runner %s", req.runner_id)

    # Influence graph: upsert token edge
    try:
        await upsert_edge(db, user.id, req.runner_id, "token", total_cost)
    except Exception:
        logger.warning("Failed to upsert influence edge for token buy (runner: %s)", req.runner_id)

    return TransactionResponse(tx_hash=None, amount=allocated_amount, price=str(total_cost))


@router.post("/sell", response_model=TransactionResponse)
async def sell_shares(
    req: SellSharesRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    result = await db.execute(select(TokenPool).where(TokenPool.runner_id == req.runner_id))
    pool = result.scalar_one_or_none()
    if not pool or int(pool.current_supply) < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient supply")

    current_supply = int(pool.current_supply)
    sell_price = bonding_curve_price(current_supply - req.amount, req.amount, DEFAULT_BASE_PRICE, DEFAULT_K)

    pool.current_supply = Decimal(current_supply - req.amount)
    pool.liquidity_pool = max(Decimal(0), Decimal(pool.liquidity_pool) - sell_price)

    tx = TokenTransaction(
        seller_id=user.id, runner_id=req.runner_id,
        amount=req.amount, price=sell_price,
    )
    db.add(tx)
    await db.flush()

    # Trigger aura recalculation if trader is an Ancient holder
    if user.wallet_address and await _is_ancient_holder(db, user.wallet_address):
        try:
            await enqueue_recalculation(req.runner_id)
        except Exception:
            logger.warning("Failed to enqueue aura recalculation for runner %s", req.runner_id)

    return TransactionResponse(tx_hash=None, amount=req.amount, price=str(sell_price))


@router.get("/pool/{runner_id}")
async def get_pool_status(runner_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TokenPool).where(TokenPool.runner_id == runner_id))
    pool = result.scalar_one_or_none()
    if not pool:
        return {"current_supply": 0, "liquidity_pool": "0", "threshold": "10", "ready_for_tge": False}
    return {
        "current_supply": int(pool.current_supply),
        "liquidity_pool": str(pool.liquidity_pool),
        "threshold": str(pool.threshold),
        "ready_for_tge": Decimal(pool.liquidity_pool) >= Decimal(pool.threshold),
    }


@router.post("/tge/{runner_id}")
async def trigger_tge(
    runner_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger Token Generation Event for a runner."""
    # Verify runner token exists and is ready
    result = await db.execute(select(RunnerToken).where(RunnerToken.runner_id == runner_id))
    runner_token = result.scalar_one_or_none()
    if not runner_token:
        raise HTTPException(status_code=404, detail="Runner token not found")
    if runner_token.status != "tge_ready":
        raise HTTPException(status_code=403, detail=f"Token status is '{runner_token.status}', must be 'tge_ready'")

    # Check threshold using aura-adjusted effective tips (Task 8.3)
    result = await db.execute(select(TokenPool).where(TokenPool.runner_id == runner_id))
    pool = result.scalar_one_or_none()
    if not pool:
        raise HTTPException(status_code=403, detail="Pool (0) has not reached threshold (10)")

    effective_tips = await get_effective_tips(db, runner_id, Decimal(pool.liquidity_pool))
    if effective_tips < Decimal(pool.threshold):
        raise HTTPException(
            status_code=403,
            detail=f"Pool ({pool.liquidity_pool}) has not reached threshold ({pool.threshold})",
        )

    # Update status
    runner_token.status = "launched"
    from datetime import datetime
    runner_token.tge_date = datetime.utcnow()

    # Record reputation event
    db.add(ReputationEvent(
        user_id=runner_id, event_type="token_launch",
        weight=100.0, event_metadata={"token_name": runner_token.token_name},
    ))
    await db.flush()

    return {
        "status": "launched",
        "token_name": runner_token.token_name,
        "token_symbol": runner_token.token_symbol,
        "tge_date": str(runner_token.tge_date),
    }
