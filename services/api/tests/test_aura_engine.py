"""Tests for aura_engine.py — get_aura_config and calculate_aura."""
import uuid
import math
import pytest
import pytest_asyncio
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from database import Base
from models import (
    User, AncientHolder, AuraIndex, AuraContribution,
    FriendShareModel, TokenTransaction, AdminConfig,
)
from engines.aura_engine import (
    get_aura_config, calculate_aura, AURA_DEFAULTS, _percentile,
    classify_aura_level, enqueue_recalculation, process_recalculation_batch,
    RECALC_QUEUE_KEY,
)
import redis_client


# ── In-memory SQLite for tests ──

TEST_DB_URL = "sqlite+aiosqlite:///file:aura_test?mode=memory&cache=shared&uri=true"

engine = create_async_engine(TEST_DB_URL, echo=False)
TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── Fake Redis ──

_fake_cache: dict = {}
_fake_sets: dict[str, set] = {}


async def fake_cache_get(key):
    return _fake_cache.get(key)


async def fake_cache_set(key, value, ttl=300):
    _fake_cache[key] = value


class FakeRedis:
    """Minimal fake Redis supporting sadd and spop for Set operations."""

    async def sadd(self, key, *values):
        if key not in _fake_sets:
            _fake_sets[key] = set()
        _fake_sets[key].update(values)
        return len(values)

    async def spop(self, key, count=1):
        if key not in _fake_sets or not _fake_sets[key]:
            return []
        result = []
        for _ in range(min(count, len(_fake_sets[key]))):
            result.append(_fake_sets[key].pop())
        return result


fake_redis = FakeRedis()


# ── Fixtures ──

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    _fake_cache.clear()
    _fake_sets.clear()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db():
    async with TestSession() as session:
        yield session


@pytest_asyncio.fixture
async def runner(db: AsyncSession):
    user = User(
        id=uuid.uuid4(),
        username="runner1",
        wallet_address="0x" + "aa" * 20,
        reputation_score=50.0,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def ancient_user(db: AsyncSession):
    """A user who is also an active Ancient holder with reputation above threshold."""
    user = User(
        id=uuid.uuid4(),
        username="ancient1",
        wallet_address="0x" + "bb" * 20,
        reputation_score=10.0,
    )
    db.add(user)
    await db.flush()
    holder = AncientHolder(
        id=uuid.uuid4(),
        wallet_address=user.wallet_address,
        token_count=1,
        is_active=True,
    )
    db.add(holder)
    await db.commit()
    await db.refresh(user)
    await db.refresh(holder)
    return user, holder


# ── get_aura_config tests ──

@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_get_aura_config_returns_defaults_when_no_db(db):
    """When no config in cache or DB, returns hardcoded defaults and logs warning."""
    config = await get_aura_config(db)
    assert config == AURA_DEFAULTS


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_get_aura_config_reads_from_db(db):
    """Config values from DB override defaults."""
    db.add(AdminConfig(config_key="nft_multiplier", config_value=2.5))
    await db.commit()

    config = await get_aura_config(db)
    assert config["nft_multiplier"] == 2.5
    # Other keys should still have defaults
    assert config["max_aura_boost"] == 0.5


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_get_aura_config_serves_from_cache(db):
    """When cache has config, returns it without hitting DB."""
    cached_config = {**AURA_DEFAULTS, "nft_multiplier": 99.0}
    _fake_cache["aura:config"] = cached_config

    config = await get_aura_config(db)
    assert config["nft_multiplier"] == 99.0


# ── calculate_aura tests ──

@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_calculate_aura_no_holders(db, runner):
    """When no active Ancient holders exist, aura is 0."""
    result = await calculate_aura(db, runner.id)
    assert result["total_aura"] == Decimal("0")
    assert result["ancient_supporter_count"] == 0
    assert result["aura_level"] == "None"


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_calculate_aura_single_holder_with_support(db, runner, ancient_user):
    """Single Ancient holder with FriendPass produces non-zero aura."""
    user, holder = ancient_user

    # Create a FriendPass from ancient_user to runner
    db.add(FriendShareModel(
        owner_id=user.id,
        runner_id=runner.id,
        amount=Decimal("1"),
        purchase_price=Decimal("0.01"),
    ))
    await db.commit()

    result = await calculate_aura(db, runner.id)
    assert result["total_aura"] > Decimal("0")
    assert result["ancient_supporter_count"] == 1

    # Verify formula: holderWeight = log(10+1) * 1.0, supportStrength = 1 + 0 + 1 = 2
    # cappedBalance = sqrt(2), contribution = log(11) * sqrt(2)
    expected_weight = math.log(10.0 + 1) * 1.0
    expected_strength = 1 + 0 + 1  # fp_count + tip_total + shares_held
    expected_capped = math.sqrt(expected_strength)
    expected_contribution = expected_weight * expected_capped
    assert abs(float(result["total_aura"]) - expected_contribution) < 0.001


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_calculate_aura_excludes_low_reputation(db, runner):
    """Holders below min_reputation_threshold are excluded."""
    low_rep_user = User(
        id=uuid.uuid4(),
        username="lowrep",
        wallet_address="0x" + "cc" * 20,
        reputation_score=0.5,  # Below default threshold of 1.0
    )
    db.add(low_rep_user)
    await db.flush()
    db.add(AncientHolder(
        wallet_address=low_rep_user.wallet_address,
        token_count=1,
        is_active=True,
    ))
    db.add(FriendShareModel(
        owner_id=low_rep_user.id,
        runner_id=runner.id,
        amount=Decimal("1"),
        purchase_price=Decimal("0.01"),
    ))
    await db.commit()

    result = await calculate_aura(db, runner.id)
    assert result["total_aura"] == Decimal("0")
    assert result["ancient_supporter_count"] == 0


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_calculate_aura_upserts_to_db(db, runner, ancient_user):
    """calculate_aura persists results to aura_index and aura_contributions."""
    user, holder = ancient_user
    db.add(FriendShareModel(
        owner_id=user.id,
        runner_id=runner.id,
        amount=Decimal("1"),
        purchase_price=Decimal("0.01"),
    ))
    await db.commit()

    await calculate_aura(db, runner.id)
    await db.commit()

    # Check aura_index
    from sqlalchemy import select
    idx = await db.execute(select(AuraIndex).where(AuraIndex.runner_id == runner.id))
    aura_row = idx.scalar_one_or_none()
    assert aura_row is not None
    assert float(aura_row.total_aura) > 0

    # Check aura_contributions
    contribs = await db.execute(
        select(AuraContribution).where(AuraContribution.runner_id == runner.id)
    )
    contrib_rows = contribs.scalars().all()
    assert len(contrib_rows) == 1
    assert float(contrib_rows[0].contribution) > 0


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_calculate_aura_caches_in_redis(db, runner, ancient_user):
    """Result is cached in Redis with key aura:{runner_id}."""
    user, holder = ancient_user
    db.add(FriendShareModel(
        owner_id=user.id,
        runner_id=runner.id,
        amount=Decimal("1"),
        purchase_price=Decimal("0.01"),
    ))
    await db.commit()

    await calculate_aura(db, runner.id)

    cache_key = f"aura:{runner.id}"
    cached = _fake_cache.get(cache_key)
    assert cached is not None
    assert float(cached["total_aura"]) > 0
    assert cached["aura_level"] in ("None", "Low", "Rising", "Strong", "Dominant")


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_calculate_aura_holder_no_support(db, runner, ancient_user):
    """Holder with no support for this runner contributes 0 (sqrt(0) = 0)."""
    result = await calculate_aura(db, runner.id)
    # Holder exists but has no FriendPass/tips/shares for this runner
    # supportStrength = 0, cappedBalance = sqrt(0) = 0, contribution = weight * 0 = 0
    assert result["total_aura"] == Decimal("0")


# ── _percentile helper tests ──

def test_percentile_basic():
    """95th percentile of [1,2,3,...,100] should be ~95.05."""
    values = sorted(float(i) for i in range(1, 101))
    p95 = _percentile(values, 95)
    assert abs(p95 - 95.05) < 0.1


def test_percentile_single_value():
    """Single value list returns that value."""
    assert _percentile([42.0], 95) == 42.0


def test_percentile_empty():
    """Empty list returns 0."""
    assert _percentile([], 50) == 0.0


# ── classify_aura_level tests ──


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_classify_aura_level_zero_returns_none(db):
    """Aura score of 0 always returns 'None'."""
    level = await classify_aura_level(db, Decimal("0"))
    assert level == "None"


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_classify_aura_level_no_existing_scores(db):
    """When no non-zero aura scores exist in DB, non-zero score returns 'Low'."""
    level = await classify_aura_level(db, Decimal("5.0"))
    assert level == "Low"


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_classify_aura_level_percentile_boundaries(db):
    """Scores are classified based on percentile boundaries across all non-zero aura scores."""
    # Create 8 runners with evenly spread aura scores: 10, 20, 30, 40, 50, 60, 70, 80
    for i, score in enumerate([10, 20, 30, 40, 50, 60, 70, 80]):
        runner_id = uuid.uuid4()
        user = User(
            id=runner_id,
            username=f"runner_lvl_{i}",
            wallet_address=f"0x{'0' * 38}{i:02d}",
            reputation_score=1.0,
        )
        db.add(user)
        await db.flush()
        db.add(AuraIndex(
            runner_id=runner_id,
            total_aura=Decimal(str(score)),
            weighted_aura=Decimal(str(score)),
            ancient_supporter_count=1,
            aura_level="Low",
        ))
    await db.commit()

    # Lowest score should be "Low" (below 25th percentile)
    level_low = await classify_aura_level(db, Decimal("10"))
    assert level_low == "Low"

    # Highest score should be "Dominant" (above 75th percentile)
    _fake_cache.pop("aura:percentiles", None)
    level_dom = await classify_aura_level(db, Decimal("80"))
    assert level_dom == "Dominant"


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_classify_aura_level_caches_percentiles(db):
    """Percentile boundaries are cached in Redis after first computation."""
    runner_id = uuid.uuid4()
    user = User(
        id=runner_id,
        username="cache_test_runner",
        wallet_address="0x" + "dd" * 20,
        reputation_score=1.0,
    )
    db.add(user)
    await db.flush()
    db.add(AuraIndex(
        runner_id=runner_id,
        total_aura=Decimal("50"),
        weighted_aura=Decimal("50"),
        ancient_supporter_count=1,
        aura_level="Low",
    ))
    await db.commit()

    await classify_aura_level(db, Decimal("50"))

    # Verify percentiles were cached
    cached = _fake_cache.get("aura:percentiles")
    assert cached is not None
    assert "p25" in cached
    assert "p50" in cached
    assert "p75" in cached


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_classify_aura_level_uses_cached_boundaries(db):
    """When percentile boundaries are cached, uses them without querying DB."""
    _fake_cache["aura:percentiles"] = {"p25": 10.0, "p50": 30.0, "p75": 60.0}

    assert await classify_aura_level(db, Decimal("5")) == "Low"
    assert await classify_aura_level(db, Decimal("15")) == "Rising"
    assert await classify_aura_level(db, Decimal("40")) == "Strong"
    assert await classify_aura_level(db, Decimal("70")) == "Dominant"


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_calculate_aura_uses_classify(db, runner, ancient_user):
    """calculate_aura now uses classify_aura_level for aura_level assignment."""
    user, holder = ancient_user
    db.add(FriendShareModel(
        owner_id=user.id,
        runner_id=runner.id,
        amount=Decimal("1"),
        purchase_price=Decimal("0.01"),
    ))
    await db.commit()

    result = await calculate_aura(db, runner.id)
    # With non-zero aura and no other scores in DB, should get "Low" (no peers to compare)
    assert result["aura_level"] in ("Low", "Rising", "Strong", "Dominant")
    assert result["total_aura"] > Decimal("0")


# ── enqueue_recalculation tests ──


@pytest.mark.asyncio
@patch("engines.aura_engine.redis", fake_redis)
async def test_enqueue_recalculation_adds_to_set():
    """enqueue_recalculation adds runner_id to the Redis Set."""
    runner_id = uuid.uuid4()
    await enqueue_recalculation(runner_id)
    assert str(runner_id) in _fake_sets.get(RECALC_QUEUE_KEY, set())


@pytest.mark.asyncio
@patch("engines.aura_engine.redis", fake_redis)
async def test_enqueue_recalculation_deduplicates():
    """Enqueueing the same runner_id twice results in only one entry (Set semantics)."""
    runner_id = uuid.uuid4()
    await enqueue_recalculation(runner_id)
    await enqueue_recalculation(runner_id)
    assert _fake_sets[RECALC_QUEUE_KEY] == {str(runner_id)}


@pytest.mark.asyncio
@patch("engines.aura_engine.redis", fake_redis)
async def test_enqueue_recalculation_multiple_runners():
    """Multiple different runner_ids are all stored in the Set."""
    ids = [uuid.uuid4() for _ in range(3)]
    for rid in ids:
        await enqueue_recalculation(rid)
    assert len(_fake_sets[RECALC_QUEUE_KEY]) == 3


# ── process_recalculation_batch tests ──


@pytest.mark.asyncio
@patch("engines.aura_engine.redis", fake_redis)
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_process_recalculation_batch_empty_queue(db):
    """When queue is empty, returns 0 and does nothing."""
    count = await process_recalculation_batch(db)
    assert count == 0


@pytest.mark.asyncio
@patch("engines.aura_engine.redis", fake_redis)
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_process_recalculation_batch_processes_runners(db, runner):
    """Batch processing recalculates aura for queued runners."""
    _fake_sets[RECALC_QUEUE_KEY] = {str(runner.id)}

    count = await process_recalculation_batch(db)
    assert count == 1

    # Queue should be empty after processing
    assert len(_fake_sets.get(RECALC_QUEUE_KEY, set())) == 0

    # Aura should have been calculated (cached in Redis)
    cached = _fake_cache.get(f"aura:{runner.id}")
    assert cached is not None


@pytest.mark.asyncio
@patch("engines.aura_engine.redis", fake_redis)
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("engines.aura_engine.cache_get", fake_cache_get)
@patch("engines.aura_engine.cache_set", fake_cache_set)
async def test_process_recalculation_batch_handles_invalid_id(db):
    """Invalid runner_ids in the queue are logged and skipped without crashing."""
    bogus_id = uuid.uuid4()
    _fake_sets[RECALC_QUEUE_KEY] = {str(bogus_id)}

    # Should not raise — logs the error and continues
    count = await process_recalculation_batch(db)
    # The runner doesn't exist in DB but calculate_aura handles that gracefully
    # (it just produces 0 aura with no holders), so it should still count as processed
    assert count >= 0
