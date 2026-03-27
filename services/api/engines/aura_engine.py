"""Aura Engine — core aura score calculation for Ancient NFT holder influence."""
import logging
import math
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    AncientHolder, AuraIndex, AuraContribution,
    User, Wallet, FriendShareModel, TokenTransaction, FraudEvent,
    AdminConfig, AuditLog,
)
from redis_client import cache_get, cache_set, redis, TTL_AURA_SCORE, TTL_AURA_CONFIG, TTL_AURA_PERCENTILES

logger = logging.getLogger(__name__)

AURA_DEFAULTS = {
    "nft_multiplier": 1.0,
    "aura_boost_factor": 0.1,
    "max_aura_boost": 0.5,
    "max_aura_multiplier": 1.0,
    "max_aura_factor": 0.5,
    "ancient_multiplier": 1.2,
    "min_reputation_threshold": 1.0,
    "max_contribution_percentile": 95,
}

CACHE_KEY_AURA_CONFIG = "aura:config"


def _percentile(sorted_values: list[float], pct: float) -> float:
    """Compute the pct-th percentile from a pre-sorted list (linear interpolation)."""
    if not sorted_values:
        return 0.0
    n = len(sorted_values)
    k = (pct / 100.0) * (n - 1)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_values[int(k)]
    return sorted_values[f] + (k - f) * (sorted_values[c] - sorted_values[f])


async def get_aura_config(db: AsyncSession) -> dict:
    """Read aura config: Redis (TTL 1hr) → DB (admin_config) → hardcoded defaults.

    Logs a warning when falling back to hardcoded defaults.
    """
    cached = await cache_get(CACHE_KEY_AURA_CONFIG)
    if cached:
        return cached

    # Try DB
    config = {}
    for key in AURA_DEFAULTS:
        result = await db.execute(
            select(AdminConfig.config_value).where(AdminConfig.config_key == key)
        )
        row = result.scalar_one_or_none()
        if row is not None:
            config[key] = float(row) if not isinstance(row, (int, float)) else row

    if config:
        # Merge with defaults for any missing keys
        merged = {**AURA_DEFAULTS, **config}
        await cache_set(CACHE_KEY_AURA_CONFIG, merged, TTL_AURA_CONFIG)
        return merged

    # Fallback to hardcoded defaults
    logger.warning("Aura config not found in cache or DB, using hardcoded defaults")
    await cache_set(CACHE_KEY_AURA_CONFIG, AURA_DEFAULTS, TTL_AURA_CONFIG)
    return dict(AURA_DEFAULTS)


CACHE_KEY_AURA_PERCENTILES = "aura:percentiles"


async def classify_aura_level(db: AsyncSession, total_aura) -> str:
    """Classify aura score into None/Low/Rising/Strong/Dominant using cached percentile boundaries.

    Boundaries are recalculated at most every 5 minutes (TTL_AURA_PERCENTILES).
    Aura score of 0 always returns "None".
    """
    total_aura = float(total_aura)
    if total_aura == 0:
        return "None"

    # Try cached percentile boundaries
    boundaries = await cache_get(CACHE_KEY_AURA_PERCENTILES)

    if boundaries is None:
        # Recalculate from all non-zero aura scores
        result = await db.execute(
            select(AuraIndex.total_aura).where(AuraIndex.total_aura > 0)
        )
        scores = sorted(float(s) for s in result.scalars().all())

        if not scores:
            return "Low"

        boundaries = {
            "p25": _percentile(scores, 25),
            "p50": _percentile(scores, 50),
            "p75": _percentile(scores, 75),
        }
        await cache_set(CACHE_KEY_AURA_PERCENTILES, boundaries, TTL_AURA_PERCENTILES)

    p25 = float(boundaries["p25"])
    p50 = float(boundaries["p50"])
    p75 = float(boundaries["p75"])

    if total_aura >= p75:
        return "Dominant"
    elif total_aura >= p50:
        return "Strong"
    elif total_aura >= p25:
        return "Rising"
    else:
        return "Low"


RECALC_QUEUE_KEY = "aura:recalc_queue"
RECALC_BATCH_SIZE = 50


async def enqueue_recalculation(runner_id: UUID) -> None:
    """Add runner_id to the recalculation queue (Redis Set).

    Uses a Redis Set so duplicate runner_ids within a debounce window
    are naturally deduplicated — only one recalculation per runner
    will occur when the batch is processed.
    """
    await redis.sadd(RECALC_QUEUE_KEY, str(runner_id))


async def process_recalculation_batch(db: AsyncSession) -> int:
    """Process queued runner recalculations in batches of up to 50.

    Pops up to RECALC_BATCH_SIZE runner_ids from the Redis Set and
    calls calculate_aura for each. The Set provides natural deduplication
    so multiple triggers for the same runner within a 5-second window
    collapse into a single recalculation.

    Returns the number of runners processed.
    """
    members = await redis.spop(RECALC_QUEUE_KEY, RECALC_BATCH_SIZE)
    if not members:
        return 0

    processed = 0
    for raw_id in members:
        try:
            runner_id = UUID(raw_id)
            await calculate_aura(db, runner_id)
            processed += 1
        except Exception:
            logger.exception("Failed to recalculate aura for runner %s", raw_id)

    return processed


async def _get_linked_wallet_groups(db: AsyncSession, wallet_addresses: list[str]) -> dict[str, str]:
    """Map wallet addresses to canonical group keys for sybil aggregation.

    Groups wallets that share the same Privy user (via wallets table)
    or are flagged as linked in fraud_events.
    Returns {wallet_address: group_key} where group_key is the smallest
    wallet address in the group.
    """
    if not wallet_addresses:
        return {}

    # Build groups from shared Privy user (wallets table)
    wallet_to_user = {}
    for addr in wallet_addresses:
        result = await db.execute(
            select(Wallet.user_id).where(Wallet.wallet_address == addr)
        )
        user_id = result.scalar_one_or_none()
        if user_id:
            wallet_to_user[addr] = str(user_id)

    # Group by user_id
    user_to_wallets: dict[str, list[str]] = {}
    for addr, uid in wallet_to_user.items():
        user_to_wallets.setdefault(uid, []).append(addr)

    # Check fraud_events for linked wallets
    for addr in wallet_addresses:
        result = await db.execute(
            select(FraudEvent.event_metadata).where(
                and_(
                    FraudEvent.event_type == "linked_wallet",
                    FraudEvent.event_metadata.isnot(None),
                )
            )
        )
        for row in result.scalars().all():
            if isinstance(row, dict) and addr in row.get("wallets", []):
                linked = row.get("wallets", [])
                # Merge into a single group
                group_key = min(linked)
                for linked_addr in linked:
                    if linked_addr in wallet_addresses:
                        wallet_to_user[linked_addr] = f"fraud_{group_key}"
                        user_to_wallets.setdefault(f"fraud_{group_key}", []).append(linked_addr)

    # Build final mapping: wallet → canonical group key (smallest wallet in group)
    groups: dict[str, str] = {}
    for addr in wallet_addresses:
        uid = wallet_to_user.get(addr)
        if uid and uid in user_to_wallets and len(user_to_wallets[uid]) > 1:
            groups[addr] = min(user_to_wallets[uid])
        else:
            groups[addr] = addr  # standalone

    return groups


async def detect_aura_spike(
    db: AsyncSession, runner_id: UUID, old_aura: Decimal, new_aura: Decimal
) -> None:
    """Flag runner for review if aura increases >200% within a single recalculation.

    Creates an AuditLog entry when the spike is detected.
    """
    if old_aura <= 0:
        return
    increase_ratio = (new_aura - old_aura) / old_aura
    if increase_ratio > Decimal("2.0"):
        from datetime import datetime

        db.add(AuditLog(
            user_id=runner_id,
            action="aura_spike_detected",
            resource_type="aura_index",
            resource_id=str(runner_id),
            event_metadata={
                "old_aura": str(old_aura),
                "new_aura": str(new_aura),
                "increase_ratio": str(round(float(increase_ratio), 4)),
                "flagged_for_review": True,
            },
        ))
        logger.warning(
            "Aura spike detected for runner %s: %s → %s (%.1f%% increase)",
            runner_id, old_aura, new_aura, float(increase_ratio) * 100,
        )


async def calculate_aura(db: AsyncSession, runner_id: UUID) -> dict:
    """Core aura calculation for a single runner.

    Formula per active Ancient holder:
        holderWeight = log(reputation + 1) × nft_multiplier
        supportStrength = friendpass_count + tip_total + shares_held
        cappedBalance = sqrt(supportStrength)
        contribution = holderWeight × cappedBalance

    totalAura = Σ contributions (clamped >= 0)

    Applies:
    - min_reputation_threshold exclusion
    - Linked wallet aggregation (sybil resistance)
    - Per-holder contribution cap at max_contribution_percentile
    """
    config = await get_aura_config(db)
    nft_multiplier = float(config["nft_multiplier"])
    min_rep = float(config["min_reputation_threshold"])
    max_pct = float(config["max_contribution_percentile"])

    # 1. Query all active Ancient holders
    holders_result = await db.execute(
        select(AncientHolder).where(AncientHolder.is_active == True)  # noqa: E712
    )
    holders = holders_result.scalars().all()

    if not holders:
        # No active holders — upsert zero aura
        await _upsert_aura_index(db, runner_id, Decimal("0"), Decimal("0"), 0, "None")
        await _cache_aura(runner_id, Decimal("0"), Decimal("0"), 0, "None")
        return {
            "total_aura": Decimal("0"),
            "weighted_aura": Decimal("0"),
            "ancient_supporter_count": 0,
            "aura_level": "None",
        }

    # 2. Build linked wallet groups for sybil aggregation
    wallet_addresses = [h.wallet_address for h in holders]
    wallet_groups = await _get_linked_wallet_groups(db, wallet_addresses)

    # 3. For each holder, look up reputation and compute per-holder metrics
    #    Aggregate linked wallets as single entity
    group_data: dict[str, dict] = {}  # group_key → aggregated data

    for holder in holders:
        # Find user by wallet address to get reputation
        user_result = await db.execute(
            select(User).where(User.wallet_address == holder.wallet_address)
        )
        user = user_result.scalar_one_or_none()
        reputation = float(user.reputation_score or 0.0) if user else 0.0

        # Exclude holders below min reputation threshold
        if reputation < min_rep:
            continue

        group_key = wallet_groups.get(holder.wallet_address, holder.wallet_address)

        if group_key not in group_data:
            group_data[group_key] = {
                "holder_ids": [],
                "reputation": reputation,
                "token_count": 0,
                "friendpass_count": 0,
                "tip_total": Decimal("0"),
                "shares_held": Decimal("0"),
            }

        gd = group_data[group_key]
        gd["holder_ids"].append(holder.id)
        # Use max reputation across linked wallets
        gd["reputation"] = max(gd["reputation"], reputation)
        gd["token_count"] += holder.token_count

        # Get user_id for querying support metrics
        user_id = user.id if user else None
        if not user_id:
            continue

        # FriendPass count for this runner
        fp_count = await db.scalar(
            select(func.count(FriendShareModel.id)).where(
                and_(
                    FriendShareModel.owner_id == user_id,
                    FriendShareModel.runner_id == runner_id,
                )
            )
        ) or 0
        gd["friendpass_count"] += fp_count

        # Tip total for this runner (TokenTransactions where buyer is this user)
        tip_sum = await db.scalar(
            select(func.coalesce(func.sum(TokenTransaction.price), 0)).where(
                and_(
                    TokenTransaction.buyer_id == user_id,
                    TokenTransaction.runner_id == runner_id,
                )
            )
        ) or Decimal("0")
        gd["tip_total"] += Decimal(str(tip_sum))

        # Shares held for this runner
        shares = await db.scalar(
            select(func.coalesce(func.sum(FriendShareModel.amount), 0)).where(
                and_(
                    FriendShareModel.owner_id == user_id,
                    FriendShareModel.runner_id == runner_id,
                )
            )
        ) or Decimal("0")
        gd["shares_held"] += Decimal(str(shares))

    # 4. Compute contributions per group
    contributions: list[dict] = []
    for group_key, gd in group_data.items():
        reputation = gd["reputation"]
        holder_weight = math.log(reputation + 1) * nft_multiplier

        support_strength = (
            float(gd["friendpass_count"])
            + float(gd["tip_total"])
            + float(gd["shares_held"])
        )
        capped_balance = math.sqrt(max(support_strength, 0.0))
        contribution = holder_weight * capped_balance

        contributions.append({
            "group_key": group_key,
            "holder_ids": gd["holder_ids"],
            "holder_weight": Decimal(str(round(holder_weight, 10))),
            "support_strength": Decimal(str(round(support_strength, 10))),
            "contribution": Decimal(str(round(contribution, 10))),
        })

    # 5. Enforce per-holder contribution cap at max_contribution_percentile
    if contributions:
        contrib_values = sorted(float(c["contribution"]) for c in contributions)
        if len(contrib_values) > 1:
            cap = _percentile(contrib_values, max_pct)
            for c in contributions:
                if float(c["contribution"]) > cap:
                    c["contribution"] = Decimal(str(round(cap, 10)))

    # 6. Sum all contributions → totalAura (clamped >= 0)
    total_aura = sum(c["contribution"] for c in contributions)
    total_aura = max(total_aura, Decimal("0"))

    # weighted_aura = total_aura (same for now, future: apply additional weighting)
    weighted_aura = total_aura
    supporter_count = len(contributions)

    # aura_level classification using percentile-based boundaries
    aura_level = await classify_aura_level(db, total_aura)

    # 6b. Spike detection — read old aura before upserting
    old_aura_result = await db.execute(
        select(AuraIndex.total_aura).where(AuraIndex.runner_id == runner_id)
    )
    old_aura = old_aura_result.scalar_one_or_none()
    if old_aura is not None:
        await detect_aura_spike(db, runner_id, Decimal(str(old_aura)), total_aura)

    # 7. Upsert aura_index and aura_contributions
    await _upsert_aura_index(db, runner_id, total_aura, weighted_aura, supporter_count, aura_level)

    # Upsert individual contributions
    for c in contributions:
        for holder_id in c["holder_ids"]:
            await _upsert_aura_contribution(
                db, holder_id, runner_id,
                c["holder_weight"], c["support_strength"], c["contribution"],
            )

    await db.flush()

    # 8. Cache in Redis with TTL 15s
    await _cache_aura(runner_id, total_aura, weighted_aura, supporter_count, aura_level)

    return {
        "total_aura": total_aura,
        "weighted_aura": weighted_aura,
        "ancient_supporter_count": supporter_count,
        "aura_level": aura_level,
    }


async def _upsert_aura_index(
    db: AsyncSession,
    runner_id: UUID,
    total_aura: Decimal,
    weighted_aura: Decimal,
    supporter_count: int,
    aura_level: str,
) -> None:
    """Upsert a row in the aura_index table for the given runner."""
    from datetime import datetime

    result = await db.execute(
        select(AuraIndex).where(AuraIndex.runner_id == runner_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.total_aura = total_aura
        existing.weighted_aura = weighted_aura
        existing.ancient_supporter_count = supporter_count
        existing.aura_level = aura_level
        existing.updated_at = datetime.utcnow()
    else:
        db.add(AuraIndex(
            runner_id=runner_id,
            total_aura=total_aura,
            weighted_aura=weighted_aura,
            ancient_supporter_count=supporter_count,
            aura_level=aura_level,
        ))


async def _upsert_aura_contribution(
    db: AsyncSession,
    holder_id: UUID,
    runner_id: UUID,
    holder_weight: Decimal,
    support_strength: Decimal,
    contribution: Decimal,
) -> None:
    """Upsert a row in the aura_contributions table."""
    from datetime import datetime

    result = await db.execute(
        select(AuraContribution).where(
            and_(
                AuraContribution.ancient_holder_id == holder_id,
                AuraContribution.runner_id == runner_id,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.holder_weight = holder_weight
        existing.support_strength = support_strength
        existing.contribution = contribution
        existing.updated_at = datetime.utcnow()
    else:
        db.add(AuraContribution(
            ancient_holder_id=holder_id,
            runner_id=runner_id,
            holder_weight=holder_weight,
            support_strength=support_strength,
            contribution=contribution,
        ))


async def _cache_aura(
    runner_id: UUID,
    total_aura: Decimal,
    weighted_aura: Decimal,
    supporter_count: int,
    aura_level: str,
) -> None:
    """Cache aura result in Redis with TTL 15s.

    Uses the aura serializer to ensure Numeric fields are stored as strings
    for round-trip consistency.
    """
    from engines.aura_serializer import serialize_aura_values

    await cache_set(
        f"aura:{runner_id}",
        serialize_aura_values(total_aura, weighted_aura, supporter_count, aura_level),
        TTL_AURA_SCORE,
    )


# ---------------------------------------------------------------------------
# Helper: read a runner's totalAura from Redis cache → DB fallback
# ---------------------------------------------------------------------------

AURA_SCALING_FACTOR = 100.0  # totalAura of 100 gives max multiplier


async def _get_total_aura(db: AsyncSession, runner_id: UUID) -> float:
    """Return the runner's totalAura. Redis first, then DB, then 0."""
    cached = await cache_get(f"aura:{runner_id}")
    if cached and "total_aura" in cached:
        return float(cached["total_aura"])

    result = await db.execute(
        select(AuraIndex.total_aura).where(AuraIndex.runner_id == runner_id)
    )
    row = result.scalar_one_or_none()
    return float(row) if row is not None else 0.0


# ---------------------------------------------------------------------------
# Multiplier functions consumed by other engines
# ---------------------------------------------------------------------------


async def get_effective_supply(db: AsyncSession, runner_id: UUID, actual_supply: int) -> int:
    """Compute effective bonding-curve supply reduced by aura influence.

    effectiveSupply = supply - (auraBoostFactor × totalAura)
    Clamped to [supply * 0.5, supply].
    Returns actual_supply unchanged when aura is 0.
    """
    total_aura = await _get_total_aura(db, runner_id)
    if total_aura == 0:
        return actual_supply

    config = await get_aura_config(db)
    aura_boost_factor = float(config["aura_boost_factor"])

    effective = actual_supply - (aura_boost_factor * total_aura)
    floor = actual_supply * 0.5
    effective = max(floor, min(effective, actual_supply))
    return int(effective)


async def get_effective_tips(db: AsyncSession, runner_id: UUID, raw_tips: Decimal) -> Decimal:
    """Compute effective tips amplified by aura.

    effectiveTips = rawTips × (1 + auraMultiplier)
    auraMultiplier = min(totalAura / AURA_SCALING_FACTOR, max_aura_multiplier)
    Returns raw_tips unchanged when aura is 0.
    """
    total_aura = await _get_total_aura(db, runner_id)
    if total_aura == 0:
        return raw_tips

    config = await get_aura_config(db)
    max_aura_multiplier = float(config["max_aura_multiplier"])

    aura_multiplier = min(total_aura / AURA_SCALING_FACTOR, max_aura_multiplier)
    effective = raw_tips * Decimal(str(1 + aura_multiplier))
    return effective


async def get_aura_boost(db: AsyncSession, runner_id: UUID) -> Decimal:
    """Compute token-allocation aura boost.

    auraBoost = min(totalAura / AURA_SCALING_FACTOR, max_aura_boost)
    Returns Decimal("0") when aura is 0.
    """
    total_aura = await _get_total_aura(db, runner_id)
    if total_aura == 0:
        return Decimal("0")

    config = await get_aura_config(db)
    max_aura_boost = float(config["max_aura_boost"])

    boost = min(total_aura / AURA_SCALING_FACTOR, max_aura_boost)
    return Decimal(str(round(boost, 10)))


async def get_reputation_aura_factor(db: AsyncSession, runner_id: UUID) -> Decimal:
    """Compute reputation amplification factor from aura.

    auraFactor = min(totalAura / AURA_SCALING_FACTOR, max_aura_factor)
    Returns Decimal("0") when aura is 0.
    """
    total_aura = await _get_total_aura(db, runner_id)
    if total_aura == 0:
        return Decimal("0")

    config = await get_aura_config(db)
    max_aura_factor = float(config["max_aura_factor"])

    factor = min(total_aura / AURA_SCALING_FACTOR, max_aura_factor)
    return Decimal(str(round(factor, 10)))
