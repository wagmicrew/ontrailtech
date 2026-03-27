"""Ancient NFT Indexer — polls Base L2 for Ancient NFT Transfer events and maintains ancient_holders."""
import asyncio
import logging
from datetime import datetime
from typing import Optional, Protocol

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models import AncientHolder, AuraContribution, User
from redis_client import redis

logger = logging.getLogger(__name__)

POLL_INTERVAL = 7  # seconds (within 5-10s range)
REDIS_LAST_BLOCK_KEY = "ancient_indexer:last_block"
MAX_RETRIES = 3
BASE_RETRY_DELAY = 2  # seconds — backoff: 2s, 4s, 8s


class AncientNFTClient(Protocol):
    """Interface for the Ancient NFT web3 client (defined in task 6.3)."""

    async def get_transfer_events(self, from_block: int, to_block: int) -> list[dict]:
        """Return Transfer events between blocks. Each dict has 'from', 'to', 'tokenId'."""
        ...

    async def get_latest_block(self) -> int:
        """Return the latest block number on chain."""
        ...

    async def get_balance(self, wallet: str) -> int:
        """Return the Ancient NFT balance for a wallet address."""
        ...


class AncientNFTIndexer:
    """Polls Base L2 for Ancient NFT Transfer events and maintains ancient_holders table.

    Stores last processed block in Redis for restart resilience.
    Retries RPC errors with exponential backoff (2s, 4s, 8s).
    """

    def __init__(self, web3_client: AncientNFTClient, db_session_factory, redis_client):
        self.web3 = web3_client
        self.db_session_factory = db_session_factory
        self.redis = redis_client
        self._running = False

    async def start(self):
        """Main async polling loop. Runs indefinitely, polling every 5-10 seconds."""
        self._running = True
        logger.info("Ancient NFT Indexer starting — running full state sync")

        try:
            await self._retry_with_backoff(self.sync_full_state)
        except Exception:
            logger.exception("Full state sync failed after retries, continuing with event polling")

        logger.info("Ancient NFT Indexer entering polling loop (interval=%ds)", POLL_INTERVAL)
        while self._running:
            try:
                await self._poll_cycle()
            except Exception:
                logger.exception("Ancient NFT Indexer poll cycle error")
            await asyncio.sleep(POLL_INTERVAL)

    async def _poll_cycle(self):
        """Single poll cycle: fetch new blocks and process Transfer events."""
        last_block = await self._get_last_processed_block()
        latest_block = await self._retry_with_backoff(self.web3.get_latest_block)

        if latest_block is None or last_block >= latest_block:
            return

        from_block = last_block + 1
        to_block = latest_block

        await self._retry_with_backoff(self.process_transfer_events, from_block, to_block)
        await self._set_last_processed_block(to_block)

    async def sync_full_state(self):
        """On startup: scan all current holders from contract and upsert ancient_holders.

        Queries every wallet that has appeared in Transfer events from block 0 to latest,
        then checks their current balance to build the full holder table.
        """
        latest_block = await self.web3.get_latest_block()
        if latest_block is None:
            logger.warning("Cannot sync full state — unable to get latest block")
            return

        last_stored = await self._get_last_processed_block()
        from_block = 0 if last_stored == 0 else last_stored + 1

        if from_block > latest_block:
            logger.info("Full state sync: already up to date (block %d)", latest_block)
            return

        events = await self.web3.get_transfer_events(from_block, latest_block)
        logger.info("Full state sync: fetched %d Transfer events (blocks %d-%d)",
                     len(events), from_block, latest_block)

        # Collect unique wallet addresses from events
        wallets: set[str] = set()
        for event in events:
            from_addr = event.get("from", "").lower()
            to_addr = event.get("to", "").lower()
            zero = "0x" + "0" * 40
            if from_addr and from_addr != zero:
                wallets.add(from_addr)
            if to_addr and to_addr != zero:
                wallets.add(to_addr)

        # Check current balance for each wallet and upsert
        async with self.db_session_factory() as db:
            for wallet in wallets:
                try:
                    balance = await self.web3.get_balance(wallet)
                    await self._upsert_holder(db, wallet, balance)
                except Exception:
                    logger.exception("Failed to sync wallet %s", wallet)

            await db.commit()

        await self._set_last_processed_block(latest_block)
        logger.info("Full state sync complete — %d wallets synced to block %d",
                     len(wallets), latest_block)

    async def process_transfer_events(self, from_block: int, to_block: int):
        """Fetch Transfer events between blocks and upsert ancient_holders.

        For each Transfer event:
        - Update sender balance (may go to 0 → inactive)
        - Update receiver balance (may become active)
        - Trigger aura recalc for affected runners when holder status changes
        """
        events = await self.web3.get_transfer_events(from_block, to_block)
        if not events:
            return

        logger.info("Processing %d Transfer events (blocks %d-%d)", len(events), from_block, to_block)

        zero = "0x" + "0" * 40
        affected_wallets: set[str] = set()

        async with self.db_session_factory() as db:
            for event in events:
                from_addr = event.get("from", "").lower()
                to_addr = event.get("to", "").lower()

                # Process sender (balance decreases)
                if from_addr and from_addr != zero:
                    try:
                        balance = await self.web3.get_balance(from_addr)
                        was_active = await self._is_holder_active(db, from_addr)
                        await self._upsert_holder(db, from_addr, balance)

                        # If holder became inactive, trigger recalc for affected runners
                        if was_active and balance == 0:
                            affected_wallets.add(from_addr)
                    except Exception:
                        logger.exception("Failed to process sender %s", from_addr)

                # Process receiver (balance increases)
                if to_addr and to_addr != zero:
                    try:
                        balance = await self.web3.get_balance(to_addr)
                        was_active = await self._is_holder_active(db, to_addr)
                        await self._upsert_holder(db, to_addr, balance)

                        # If holder became newly active, trigger recalc
                        if not was_active and balance > 0:
                            affected_wallets.add(to_addr)
                    except Exception:
                        logger.exception("Failed to process receiver %s", to_addr)

            await db.commit()

            # Trigger aura recalculations for runners affected by holder status changes
            if affected_wallets:
                await self._trigger_recalc_for_wallets(db, affected_wallets)

    # ── Internal helpers ──

    async def _upsert_holder(self, db: AsyncSession, wallet_address: str, token_count: int):
        """Upsert a row in ancient_holders. Mark inactive when token_count drops to 0."""
        result = await db.execute(
            select(AncientHolder).where(AncientHolder.wallet_address == wallet_address)
        )
        existing = result.scalar_one_or_none()

        is_active = token_count > 0
        now = datetime.utcnow()

        if existing:
            existing.token_count = token_count
            existing.is_active = is_active
            existing.last_synced_at = now
        else:
            db.add(AncientHolder(
                wallet_address=wallet_address,
                token_count=token_count,
                is_active=is_active,
                last_synced_at=now,
            ))

    async def _is_holder_active(self, db: AsyncSession, wallet_address: str) -> bool:
        """Check if a wallet is currently an active holder in the DB."""
        result = await db.execute(
            select(AncientHolder.is_active).where(
                AncientHolder.wallet_address == wallet_address
            )
        )
        row = result.scalar_one_or_none()
        return bool(row) if row is not None else False

    async def _trigger_recalc_for_wallets(self, db: AsyncSession, wallets: set[str]):
        """Enqueue aura recalculation for all runners supported by the given wallets."""
        from engines.aura_engine import enqueue_recalculation

        for wallet in wallets:
            # Find the holder record
            holder_result = await db.execute(
                select(AncientHolder.id).where(AncientHolder.wallet_address == wallet)
            )
            holder_id = holder_result.scalar_one_or_none()
            if not holder_id:
                continue

            # Find all runners this holder has contributed to
            contrib_result = await db.execute(
                select(AuraContribution.runner_id).where(
                    AuraContribution.ancient_holder_id == holder_id
                )
            )
            runner_ids = contrib_result.scalars().all()

            for runner_id in runner_ids:
                try:
                    await enqueue_recalculation(runner_id)
                except Exception:
                    logger.exception("Failed to enqueue recalc for runner %s", runner_id)

            # Also check if the wallet is linked to a user who supports runners directly
            user_result = await db.execute(
                select(User.id).where(User.wallet_address == wallet)
            )
            user_id = user_result.scalar_one_or_none()
            if user_id:
                # The user themselves might be a runner with aura
                try:
                    await enqueue_recalculation(user_id)
                except Exception:
                    logger.exception("Failed to enqueue recalc for user-runner %s", user_id)

    async def _get_last_processed_block(self) -> int:
        """Read last processed block from Redis. Returns 0 if not set."""
        val = await self.redis.get(REDIS_LAST_BLOCK_KEY)
        if val is not None:
            try:
                return int(val)
            except (ValueError, TypeError):
                pass
        return 0

    async def _set_last_processed_block(self, block: int):
        """Store last processed block in Redis (persistent, no TTL)."""
        await self.redis.set(REDIS_LAST_BLOCK_KEY, str(block))

    async def _retry_with_backoff(self, fn, *args, **kwargs):
        """Execute fn with exponential backoff on failure. Max 3 retries (delays: 2s, 4s, 8s).

        Logs each retry attempt. Returns None if all retries exhausted.
        """
        last_error: Optional[Exception] = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                return await fn(*args, **kwargs)
            except Exception as e:
                last_error = e
                if attempt < MAX_RETRIES:
                    delay = BASE_RETRY_DELAY * (2 ** attempt)
                    logger.warning(
                        "RPC error on %s (attempt %d/%d), retrying in %ds: %s",
                        fn.__name__, attempt + 1, MAX_RETRIES + 1, delay, e,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        "RPC error on %s exhausted all %d retries: %s",
                        fn.__name__, MAX_RETRIES + 1, e,
                    )
        return None

    def stop(self):
        """Signal the polling loop to stop."""
        self._running = False
