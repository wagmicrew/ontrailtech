"""Event Indexer — polls Base L2 chain events for FriendShares mints and TipVault tips."""
import asyncio
import logging
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models import AncientHolder, FriendShareModel, ReputationEvent, User, TokenTransaction
from engines.aura_engine import enqueue_recalculation
from engines.influence_engine import upsert_edge
from web3_client import w3, get_friend_shares_client
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

POLL_INTERVAL = 7  # seconds
FRIENDPASS_MINT_TOPIC = None  # Set from contract ABI on init
TIP_RECEIVED_TOPIC = None

# Track last processed block to avoid re-processing
_last_block: int = 0

FRIENDPASS_BUY_REP_WEIGHT = 15.0
FRIENDPASS_RUNNER_REP_WEIGHT = 10.0
TIP_REP_WEIGHT = 5.0


async def _is_ancient_holder(db: AsyncSession, wallet_address: str) -> bool:
    """Check if a wallet address belongs to an active Ancient NFT holder."""
    result = await db.execute(
        select(AncientHolder).where(
            AncientHolder.wallet_address == wallet_address.lower(),
            AncientHolder.is_active == True,
        )
    )
    return result.scalar_one_or_none() is not None


async def _get_start_block() -> int:
    """Get the block to start indexing from."""
    global _last_block
    if _last_block > 0:
        return _last_block
    if w3 and w3.is_connected():
        _last_block = w3.eth.block_number - 100  # Start 100 blocks back on first run
    return max(_last_block, 0)


async def _process_friendpass_mint(event: dict, db: AsyncSession) -> None:
    """Process a FriendPass mint event — create friend_shares record + reputation events."""
    args = event.get("args", {})
    buyer_address = args.get("buyer", "").lower()
    runner_address = args.get("runner", "").lower()
    amount = args.get("amount", 1)
    price = args.get("price", 0)
    tx_hash = event.get("transactionHash", b"").hex() if isinstance(event.get("transactionHash"), bytes) else str(event.get("transactionHash", ""))

    # Idempotency: check if we already indexed this tx
    existing = await db.execute(
        select(TokenTransaction).where(TokenTransaction.tx_hash == tx_hash)
    )
    if existing.scalar_one_or_none():
        return

    # Look up buyer and runner users
    buyer_result = await db.execute(select(User).where(User.wallet_address == buyer_address))
    buyer = buyer_result.scalar_one_or_none()
    runner_result = await db.execute(select(User).where(User.wallet_address == runner_address))
    runner = runner_result.scalar_one_or_none()

    if not buyer or not runner:
        logger.warning(f"FriendPass mint: buyer or runner not found ({buyer_address}, {runner_address})")
        return

    # Create friend_shares record
    share = FriendShareModel(
        owner_id=buyer.id,
        runner_id=runner.id,
        amount=amount,
        purchase_price=price / 1e18 if isinstance(price, int) else price,
    )
    db.add(share)

    # Create token transaction record
    tx_record = TokenTransaction(
        buyer_id=buyer.id,
        runner_id=runner.id,
        amount=amount,
        price=price / 1e18 if isinstance(price, int) else price,
        tx_hash=tx_hash,
    )
    db.add(tx_record)

    # Reputation events for buyer
    db.add(ReputationEvent(
        user_id=buyer.id,
        event_type="friendpass_bought",
        weight=FRIENDPASS_BUY_REP_WEIGHT,
        event_metadata={"runner_id": str(runner.id), "tx_hash": tx_hash},
    ))
    buyer.reputation_score = max((buyer.reputation_score or 0.0) + FRIENDPASS_BUY_REP_WEIGHT, 0.0)

    # Reputation events for runner
    db.add(ReputationEvent(
        user_id=runner.id,
        event_type="friendpass_received",
        weight=FRIENDPASS_RUNNER_REP_WEIGHT,
        event_metadata={"buyer_id": str(buyer.id), "tx_hash": tx_hash},
    ))
    runner.reputation_score = max((runner.reputation_score or 0.0) + FRIENDPASS_RUNNER_REP_WEIGHT, 0.0)

    await db.flush()
    logger.info(f"Indexed FriendPass mint: {buyer_address} → {runner_address} (tx: {tx_hash})")

    # Aura recalculation: if buyer is an active Ancient holder, enqueue recalc for the runner
    if await _is_ancient_holder(db, buyer_address):
        await enqueue_recalculation(runner.id)
        logger.info(f"Enqueued aura recalculation for runner {runner.id} (Ancient holder FriendPass mint)")

    # Influence graph: upsert friendpass edge
    try:
        edge_weight = price / 1e18 if isinstance(price, int) else price
        await upsert_edge(db, buyer.id, runner.id, "friendpass", edge_weight)
    except Exception:
        logger.warning("Failed to upsert influence edge for FriendPass mint (tx: %s)", tx_hash)


async def _process_tip_event(event: dict, db: AsyncSession) -> None:
    """Process a TipVault tip event — create tip record + reputation event."""
    args = event.get("args", {})
    tipper_address = args.get("user", "").lower()
    runner_address = args.get("runner", "").lower()
    amount = args.get("amount", 0)
    tx_hash = event.get("transactionHash", b"").hex() if isinstance(event.get("transactionHash"), bytes) else str(event.get("transactionHash", ""))

    # Idempotency check
    existing = await db.execute(
        select(TokenTransaction).where(TokenTransaction.tx_hash == tx_hash)
    )
    if existing.scalar_one_or_none():
        return

    tipper_result = await db.execute(select(User).where(User.wallet_address == tipper_address))
    tipper = tipper_result.scalar_one_or_none()
    runner_result = await db.execute(select(User).where(User.wallet_address == runner_address))
    runner = runner_result.scalar_one_or_none()

    if not tipper or not runner:
        logger.warning(f"Tip event: tipper or runner not found ({tipper_address}, {runner_address})")
        return

    # Create tip transaction record
    tx_record = TokenTransaction(
        buyer_id=tipper.id,
        runner_id=runner.id,
        amount=1,
        price=amount / 1e18 if isinstance(amount, int) else amount,
        tx_hash=tx_hash,
    )
    db.add(tx_record)

    # Reputation event for tipper
    db.add(ReputationEvent(
        user_id=tipper.id,
        event_type="tip_sent",
        weight=TIP_REP_WEIGHT,
        event_metadata={"runner_id": str(runner.id), "amount": str(amount), "tx_hash": tx_hash},
    ))
    tipper.reputation_score = max((tipper.reputation_score or 0.0) + TIP_REP_WEIGHT, 0.0)

    await db.flush()
    logger.info(f"Indexed tip: {tipper_address} → {runner_address} (tx: {tx_hash})")

    # Aura recalculation: if tipper is an active Ancient holder, enqueue recalc for the runner
    if await _is_ancient_holder(db, tipper_address):
        await enqueue_recalculation(runner.id)
        logger.info(f"Enqueued aura recalculation for runner {runner.id} (Ancient holder tip)")

    # Influence graph: upsert tip edge
    try:
        edge_weight = amount / 1e18 if isinstance(amount, int) else amount
        await upsert_edge(db, tipper.id, runner.id, "tip", edge_weight)
    except Exception:
        logger.warning("Failed to upsert influence edge for tip (tx: %s)", tx_hash)


async def poll_events() -> None:
    """Single poll cycle: fetch new events from chain and process them."""
    global _last_block
    if not w3 or not w3.is_connected():
        return

    current_block = w3.eth.block_number
    from_block = await _get_start_block()

    if from_block >= current_block:
        return

    # Get FriendShares contract events
    friend_shares_address = settings.friend_shares_address
    if friend_shares_address:
        try:
            client = get_friend_shares_client()
            if client and client.contract:
                # Poll for Transfer events (ERC-1155)
                events = client.contract.events.TransferSingle.get_logs(
                    fromBlock=from_block, toBlock=current_block
                )
                async with AsyncSessionLocal() as db:
                    for event in events:
                        await _process_friendpass_mint(event, db)
                    await db.commit()
        except Exception as e:
            logger.error(f"Error polling FriendShares events: {e}")

    _last_block = current_block + 1


async def run_indexer() -> None:
    """Main indexer loop — runs continuously, polling every POLL_INTERVAL seconds."""
    logger.info("Event indexer started")
    while True:
        try:
            await poll_events()
        except Exception as e:
            logger.error(f"Event indexer error: {e}")
        await asyncio.sleep(POLL_INTERVAL)
