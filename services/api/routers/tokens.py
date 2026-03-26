from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from database import get_db
from models import RunnerToken, FriendShareModel, TokenPool, TokenTransaction, ReputationEvent, User
from dependencies import get_current_user

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


@router.get("/price/{runner_id}", response_model=PriceQuoteResponse)
async def get_price_quote(runner_id: str, amount: int = 1, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TokenPool).where(TokenPool.runner_id == runner_id))
    pool = result.scalar_one_or_none()
    current_supply = int(pool.current_supply) if pool else 0
    total = bonding_curve_price(current_supply, amount, DEFAULT_BASE_PRICE, DEFAULT_K)
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
    total_cost = bonding_curve_price(current_supply, req.amount, DEFAULT_BASE_PRICE, DEFAULT_K)

    # Record share
    share = FriendShareModel(
        owner_id=user.id, runner_id=req.runner_id,
        amount=req.amount, purchase_price=total_cost,
    )
    db.add(share)
    pool.current_supply = Decimal(current_supply + req.amount)
    pool.liquidity_pool = Decimal(pool.liquidity_pool) + total_cost

    tx = TokenTransaction(
        buyer_id=user.id, runner_id=req.runner_id,
        amount=req.amount, price=total_cost,
    )
    db.add(tx)
    await db.flush()

    return TransactionResponse(tx_hash=None, amount=req.amount, price=str(total_cost))


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
