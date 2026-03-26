"""Token Economy Engine - bonding curves, share trading, TGE mechanics."""
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import RunnerToken, FriendShareModel, TokenPool, TokenTransaction
from redis_client import cache_get, cache_set, TTL_TOKEN_PRICE

DEFAULT_BASE_PRICE = Decimal("0.001")
DEFAULT_K = Decimal("0.0001")


def bonding_curve_price(
    supply: int, amount: int,
    base: Decimal = DEFAULT_BASE_PRICE,
    k: Decimal = DEFAULT_K,
) -> Decimal:
    """Calculate total cost for buying `amount` shares at current `supply`."""
    total = Decimal(0)
    for i in range(amount):
        total += base + k * Decimal((supply + i) ** 2)
    return total


def bonding_curve_sell_price(
    supply: int, amount: int,
    base: Decimal = DEFAULT_BASE_PRICE,
    k: Decimal = DEFAULT_K,
) -> Decimal:
    """Calculate payout for selling `amount` shares from current `supply`."""
    total = Decimal(0)
    for i in range(amount):
        total += base + k * Decimal((supply - 1 - i) ** 2)
    return total


async def get_price_quote(db: AsyncSession, runner_id: str, amount: int = 1) -> dict:
    cache_key = f"token_price:{runner_id}:{amount}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    result = await db.execute(select(TokenPool).where(TokenPool.runner_id == runner_id))
    pool = result.scalar_one_or_none()
    supply = int(pool.current_supply) if pool else 0
    total = bonding_curve_price(supply, amount)
    per_share = total / amount if amount > 0 else Decimal(0)

    quote = {
        "total_cost": str(total),
        "current_supply": supply,
        "price_per_share": str(per_share),
    }
    await cache_set(cache_key, quote, TTL_TOKEN_PRICE)
    return quote


async def buy_shares(
    db: AsyncSession, investor_id, runner_id: str, amount: int
) -> dict:
    if str(investor_id) == runner_id:
        raise ValueError("Cannot buy your own shares")
    if amount <= 0:
        raise ValueError("Amount must be positive")

    result = await db.execute(select(TokenPool).where(TokenPool.runner_id == runner_id))
    pool = result.scalar_one_or_none()
    if not pool:
        pool = TokenPool(
            runner_id=runner_id, current_supply=0,
            liquidity_pool=0, threshold=Decimal("10"),
        )
        db.add(pool)
        await db.flush()

    supply = int(pool.current_supply)
    cost = bonding_curve_price(supply, amount)

    share = FriendShareModel(
        owner_id=investor_id, runner_id=runner_id,
        amount=amount, purchase_price=cost,
    )
    db.add(share)
    pool.current_supply = Decimal(supply + amount)
    pool.liquidity_pool = Decimal(pool.liquidity_pool) + cost

    tx = TokenTransaction(
        buyer_id=investor_id, runner_id=runner_id,
        amount=amount, price=cost,
    )
    db.add(tx)
    await db.flush()

    return {"amount": amount, "price": str(cost), "new_supply": supply + amount}


async def sell_shares(
    db: AsyncSession, seller_id, runner_id: str, amount: int
) -> dict:
    if amount <= 0:
        raise ValueError("Amount must be positive")

    result = await db.execute(select(TokenPool).where(TokenPool.runner_id == runner_id))
    pool = result.scalar_one_or_none()
    if not pool or int(pool.current_supply) < amount:
        raise ValueError("Insufficient supply")

    supply = int(pool.current_supply)
    payout = bonding_curve_sell_price(supply, amount)

    pool.current_supply = Decimal(supply - amount)
    pool.liquidity_pool = max(Decimal(0), Decimal(pool.liquidity_pool) - payout)

    tx = TokenTransaction(
        seller_id=seller_id, runner_id=runner_id,
        amount=amount, price=payout,
    )
    db.add(tx)
    await db.flush()

    return {"amount": amount, "price": str(payout), "new_supply": supply - amount}


async def check_tge_threshold(db: AsyncSession, runner_id: str) -> dict:
    result = await db.execute(select(TokenPool).where(TokenPool.runner_id == runner_id))
    pool = result.scalar_one_or_none()
    if not pool:
        return {"ready": False, "pool": "0", "threshold": "10"}
    ready = Decimal(pool.liquidity_pool) >= Decimal(pool.threshold)
    return {
        "ready": ready,
        "pool": str(pool.liquidity_pool),
        "threshold": str(pool.threshold),
        "supply": int(pool.current_supply),
    }
