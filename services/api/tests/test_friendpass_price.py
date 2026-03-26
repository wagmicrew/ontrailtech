"""Tests for GET /friendpass/price/{runner_id} endpoint."""
import uuid
import time
import pytest
import pytest_asyncio
from decimal import Decimal
from unittest.mock import patch

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from database import Base
from main import app
from database import get_db
from models import User, FriendShareModel
import redis_client


# ── In-memory SQLite for tests ──

TEST_DB_URL = "sqlite+aiosqlite:///file:friendpass_test?mode=memory&cache=shared&uri=true"

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
_fake_raw_store: dict = {}


async def fake_cache_get(key):
    return _fake_cache.get(key)


async def fake_cache_set(key, value, ttl=300):
    _fake_cache[key] = value


# ── Fixtures ──

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
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


# ── Tests ──

@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.friendpass.cache_get", fake_cache_get)
@patch("routers.friendpass.cache_set", fake_cache_set)
@patch("routers.friendpass.get_friend_shares_client", return_value=None)
async def test_friendpass_price_returns_full_shape(mock_web3, client, runner_user):
    """Test endpoint returns all required fields."""
    resp = await client.get(f"/friendpass/price/{runner_user.id}")
    assert resp.status_code == 200
    data = resp.json()

    assert "currentPrice" in data
    assert "currentPriceFiat" in data
    assert "nextPrice" in data
    assert "currentSupply" in data
    assert "maxSupply" in data
    assert "benefits" in data
    assert isinstance(data["benefits"], list)
    assert len(data["benefits"]) > 0


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.friendpass.cache_get", fake_cache_get)
@patch("routers.friendpass.cache_set", fake_cache_set)
@patch("routers.friendpass.get_friend_shares_client", return_value=None)
async def test_friendpass_price_linear_formula_zero_supply(mock_web3, client, runner_user):
    """Price(0) = 0.001 + 0.0001 * 0 = 0.001000, next = 0.001100."""
    resp = await client.get(f"/friendpass/price/{runner_user.id}")
    assert resp.status_code == 200
    data = resp.json()

    assert data["currentPrice"] == "0.001000"
    assert data["nextPrice"] == "0.001100"
    assert data["currentSupply"] == 0
    assert data["maxSupply"] == 100


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.friendpass.cache_get", fake_cache_get)
@patch("routers.friendpass.cache_set", fake_cache_set)
@patch("routers.friendpass.get_friend_shares_client", return_value=None)
async def test_friendpass_price_with_existing_supply(mock_web3, client, runner_user, db_session):
    """Price reflects actual supply count from DB."""
    buyer = User(
        id=uuid.uuid4(),
        username="buyer1",
        wallet_address="0x" + "b2" * 20,
        reputation_score=10.0,
    )
    db_session.add(buyer)
    await db_session.flush()

    for i in range(5):
        share = FriendShareModel(
            id=uuid.uuid4(),
            owner_id=buyer.id,
            runner_id=runner_user.id,
            amount=Decimal("1"),
            purchase_price=Decimal("0.001"),
        )
        db_session.add(share)
    await db_session.commit()

    resp = await client.get(f"/friendpass/price/{runner_user.id}")
    assert resp.status_code == 200
    data = resp.json()

    assert data["currentSupply"] == 5
    # Price(5) = 0.001 + 0.0001 * 5 = 0.001500
    assert data["currentPrice"] == "0.001500"
    # Next = Price(6) = 0.001 + 0.0001 * 6 = 0.001600
    assert data["nextPrice"] == "0.001600"


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.friendpass.cache_get", fake_cache_get)
@patch("routers.friendpass.cache_set", fake_cache_set)
@patch("routers.friendpass.get_friend_shares_client", return_value=None)
async def test_friendpass_price_runner_not_found(mock_web3, client):
    """Non-existent runner ID returns 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/friendpass/price/{fake_id}")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.friendpass.cache_get", fake_cache_get)
@patch("routers.friendpass.cache_set", fake_cache_set)
@patch("routers.friendpass.get_friend_shares_client", return_value=None)
async def test_friendpass_price_caches_result(mock_web3, client, runner_user):
    """First call populates cache; second call serves from cache."""
    resp1 = await client.get(f"/friendpass/price/{runner_user.id}")
    assert resp1.status_code == 200

    cache_key = f"friendpass_price:{runner_user.id}"
    cached = _fake_cache.get(cache_key)
    assert cached is not None
    assert cached["currentPrice"] == "0.001000"

    # Second call should hit cache
    resp2 = await client.get(f"/friendpass/price/{runner_user.id}")
    assert resp2.status_code == 200
    assert resp2.json() == resp1.json()


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.friendpass.cache_get", fake_cache_get)
@patch("routers.friendpass.cache_set", fake_cache_set)
@patch("routers.friendpass.get_friend_shares_client", return_value=None)
async def test_friendpass_price_staleness_refresh(mock_web3, client, runner_user):
    """Stale cache (>10s) triggers a refresh."""
    cache_key = f"friendpass_price:{runner_user.id}"
    stale_data = {
        "currentPrice": "0.999000",
        "currentPriceFiat": "$2997.00",
        "nextPrice": "0.999100",
        "currentSupply": 99,
        "maxSupply": 100,
        "benefits": ["old benefit"],
        "_cached_at": time.time() - 15,  # 15s ago — stale
    }
    _fake_cache[cache_key] = stale_data

    resp = await client.get(f"/friendpass/price/{runner_user.id}")
    assert resp.status_code == 200
    data = resp.json()

    # Should have refreshed — supply is actually 0
    assert data["currentSupply"] == 0
    assert data["currentPrice"] == "0.001000"


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.friendpass.cache_get", fake_cache_get)
@patch("routers.friendpass.cache_set", fake_cache_set)
@patch("routers.friendpass.get_friend_shares_client", return_value=None)
async def test_friendpass_price_fresh_cache_served(mock_web3, client, runner_user):
    """Fresh cache (<=10s) is served directly without DB query."""
    cache_key = f"friendpass_price:{runner_user.id}"
    fresh_data = {
        "currentPrice": "0.005000",
        "currentPriceFiat": "$15.00",
        "nextPrice": "0.005100",
        "currentSupply": 40,
        "maxSupply": 100,
        "benefits": ["cached benefit"],
        "_cached_at": time.time() - 3,  # 3s ago — fresh
    }
    _fake_cache[cache_key] = fresh_data

    resp = await client.get(f"/friendpass/price/{runner_user.id}")
    assert resp.status_code == 200
    data = resp.json()

    # Should serve cached data as-is
    assert data["currentSupply"] == 40
    assert data["currentPrice"] == "0.005000"


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.friendpass.cache_get", fake_cache_get)
@patch("routers.friendpass.cache_set", fake_cache_set)
@patch("routers.friendpass.get_friend_shares_client", return_value=None)
async def test_friendpass_price_includes_fiat(mock_web3, client, runner_user):
    """Fiat price is ETH * 3000 rate."""
    resp = await client.get(f"/friendpass/price/{runner_user.id}")
    assert resp.status_code == 200
    data = resp.json()
    # 0.001 ETH * 3000 = $3.00
    assert data["currentPriceFiat"] == "$3.00"
