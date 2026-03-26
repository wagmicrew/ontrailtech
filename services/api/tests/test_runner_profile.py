"""Tests for GET /users/runner/{username} aggregated endpoint."""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch, MagicMock
from decimal import Decimal

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from database import Base
from main import app
from database import get_db
from models import (
    User, RunnerToken, FriendShareModel, TokenTransaction,
    ReputationEvent, TokenPool,
)
import redis_client


# ── In-memory SQLite for tests ──

TEST_DB_URL = "sqlite+aiosqlite:///file::memory:?cache=shared&uri=true"

engine = create_async_engine(TEST_DB_URL, echo=False)
TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


app.dependency_overrides[get_db] = override_get_db


# ── Fake Redis (in-memory dict) ──

_fake_cache: dict = {}


async def fake_cache_get(key):
    return _fake_cache.get(key)


async def fake_cache_set(key, value, ttl=300):
    _fake_cache[key] = value


async def fake_cache_delete(key):
    _fake_cache.pop(key, None)


# ── Fixtures ──

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create tables before each test, drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    _fake_cache.clear()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session():
    async with TestSession() as session:
        yield session


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def runner_user(db_session: AsyncSession):
    """Create a runner user in the DB."""
    user = User(
        id=uuid.uuid4(),
        username="hansen",
        wallet_address="0x" + "a1" * 20,
        reputation_score=42.5,
        email="hansen@test.com",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def runner_with_token(db_session: AsyncSession, runner_user):
    """Create a runner with a token and pool."""
    token = RunnerToken(
        id=uuid.uuid4(),
        runner_id=runner_user.id,
        token_name="RUNNER_HANSEN",
        token_symbol="HANSEN",
        status="bonding_curve",
        bonding_curve_pool=Decimal("0.5"),
    )
    pool = TokenPool(
        id=uuid.uuid4(),
        runner_id=runner_user.id,
        current_supply=Decimal("100"),
        liquidity_pool=Decimal("0.5"),
        threshold=Decimal("1.0"),
    )
    db_session.add_all([token, pool])
    await db_session.commit()
    return runner_user, token, pool


# ── Tests ──

@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.users.cache_get", fake_cache_get)
@patch("routers.users.cache_set", fake_cache_set)
@patch("routers.users.get_friend_shares_client", return_value=None)
async def test_runner_profile_returns_full_data(mock_web3, client, runner_user):
    """Test that the endpoint returns the full RunnerProfileData shape."""
    resp = await client.get(f"/users/runner/{runner_user.username}")
    assert resp.status_code == 200
    data = resp.json()

    assert data["id"] == str(runner_user.id)
    assert data["username"] == "hansen"
    assert data["reputationScore"] == 42.5
    assert data["rank"] == 1  # only user
    assert data["tokenStatus"] == "bonding_curve"

    # FriendPass shape
    fp = data["friendPass"]
    assert "sold" in fp
    assert "maxSupply" in fp
    assert "currentPrice" in fp
    assert "currentPriceFiat" in fp
    assert "nextPrice" in fp
    assert fp["sold"] == 0
    assert fp["maxSupply"] == 100

    # Stats shape
    stats = data["stats"]
    assert "totalSupporters" in stats
    assert "totalTips" in stats
    assert "tokenProgress" in stats

    # Activity feed
    assert isinstance(data["activityFeed"], list)


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.users.cache_get", fake_cache_get)
@patch("routers.users.cache_set", fake_cache_set)
@patch("routers.users.get_friend_shares_client", return_value=None)
async def test_runner_not_found_returns_404(mock_web3, client):
    """Test that a non-existent runner returns 404 with message."""
    resp = await client.get("/users/runner/nonexistent")
    assert resp.status_code == 404
    data = resp.json()
    assert "not found" in data["detail"].lower()


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.users.cache_get", fake_cache_get)
@patch("routers.users.cache_set", fake_cache_set)
@patch("routers.users.get_friend_shares_client", return_value=None)
async def test_runner_profile_caches_response(mock_web3, client, runner_user):
    """Test that the response is cached in Redis after first call."""
    resp1 = await client.get(f"/users/runner/{runner_user.username}")
    assert resp1.status_code == 200

    # Verify cache was populated
    cache_key = f"runner_profile:{runner_user.username}"
    cached = _fake_cache.get(cache_key)
    assert cached is not None
    assert cached["username"] == "hansen"

    # Second call should hit cache
    resp2 = await client.get(f"/users/runner/{runner_user.username}")
    assert resp2.status_code == 200
    assert resp2.json() == resp1.json()


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.users.cache_get", fake_cache_get)
@patch("routers.users.cache_set", fake_cache_set)
@patch("routers.users.get_friend_shares_client", return_value=None)
async def test_runner_profile_with_token_progress(mock_web3, client, runner_with_token):
    """Test token progress calculation (pool/threshold * 100)."""
    runner_user, token, pool = runner_with_token
    resp = await client.get(f"/users/runner/{runner_user.username}")
    assert resp.status_code == 200
    data = resp.json()
    # pool=0.5, threshold=1.0 → 50%
    assert data["stats"]["tokenProgress"] == 50
    assert data["tokenStatus"] == "bonding_curve"


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.users.cache_get", fake_cache_get)
@patch("routers.users.cache_set", fake_cache_set)
@patch("routers.users.get_friend_shares_client", return_value=None)
async def test_runner_profile_friendpass_sold_count(mock_web3, client, runner_user, db_session):
    """Test that FriendPass sold count reflects friend_shares records."""
    buyer = User(
        id=uuid.uuid4(),
        username="buyer1",
        wallet_address="0x" + "b2" * 20,
        reputation_score=10.0,
    )
    db_session.add(buyer)
    await db_session.flush()

    share = FriendShareModel(
        id=uuid.uuid4(),
        owner_id=buyer.id,
        runner_id=runner_user.id,
        amount=Decimal("1"),
        purchase_price=Decimal("0.001"),
    )
    db_session.add(share)
    await db_session.commit()

    resp = await client.get(f"/users/runner/{runner_user.username}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["friendPass"]["sold"] == 1
    assert data["stats"]["totalSupporters"] == 1


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.users.cache_get", fake_cache_get)
@patch("routers.users.cache_set", fake_cache_set)
@patch("routers.users.get_friend_shares_client", return_value=None)
async def test_runner_profile_activity_feed(mock_web3, client, runner_user, db_session):
    """Test that activity feed includes recent events."""
    buyer = User(
        id=uuid.uuid4(),
        username="tipper",
        wallet_address="0x" + "c3" * 20,
        reputation_score=5.0,
    )
    db_session.add(buyer)
    await db_session.flush()

    tx = TokenTransaction(
        id=uuid.uuid4(),
        buyer_id=buyer.id,
        runner_id=runner_user.id,
        amount=Decimal("1"),
        price=Decimal("0.002"),
        created_at=datetime.utcnow() - timedelta(minutes=10),
    )
    db_session.add(tx)
    await db_session.commit()

    resp = await client.get(f"/users/runner/{runner_user.username}")
    assert resp.status_code == 200
    data = resp.json()
    feed = data["activityFeed"]
    assert len(feed) >= 1
    buy_items = [f for f in feed if f["type"] == "friendpass_buy"]
    assert len(buy_items) == 1
    assert buy_items[0]["username"] == "tipper"


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.users.cache_get", fake_cache_get)
@patch("routers.users.cache_set", fake_cache_set)
@patch("routers.users.get_friend_shares_client", return_value=None)
async def test_friendpass_price_uses_linear_formula(mock_web3, client, runner_user):
    """Test that FriendPass price follows Price(n) = basePrice + slope * n."""
    resp = await client.get(f"/users/runner/{runner_user.username}")
    data = resp.json()
    # sold=0 → price = 0.001 + 0.0001 * 0 = 0.001
    assert data["friendPass"]["currentPrice"] == "0.001000"
    # next = 0.001 + 0.0001 * 1 = 0.0011
    assert data["friendPass"]["nextPrice"] == "0.001100"


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.users.cache_get", fake_cache_get)
@patch("routers.users.cache_set", fake_cache_set)
@patch("routers.users.get_friend_shares_client", return_value=None)
async def test_runner_rank_with_multiple_users(mock_web3, client, runner_user, db_session):
    """Test rank calculation: user with higher rep gets lower rank number."""
    top_user = User(
        id=uuid.uuid4(),
        username="toprunner",
        wallet_address="0x" + "d4" * 20,
        reputation_score=100.0,
    )
    db_session.add(top_user)
    await db_session.commit()

    resp = await client.get(f"/users/runner/{runner_user.username}")
    data = resp.json()
    # hansen has 42.5, toprunner has 100 → hansen is rank 2
    assert data["rank"] == 2
