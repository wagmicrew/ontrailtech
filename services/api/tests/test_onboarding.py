"""Tests for POST /onboarding/register endpoint."""
import uuid
import pytest
import pytest_asyncio
from unittest.mock import patch, AsyncMock

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from database import Base
from main import app
from database import get_db
from models import User, ReputationEvent, Referral
import redis_client


# ── In-memory SQLite for tests ──

TEST_DB_URL = "sqlite+aiosqlite:///file:test_onboarding?mode=memory&cache=shared&uri=true"

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


# ── Fake Redis ──

_fake_cache: dict = {}


async def fake_cache_get(key):
    return _fake_cache.get(key)


async def fake_cache_set(key, value, ttl=300):
    _fake_cache[key] = value


# ── Fake rate limiter ──

_rate_limit_counts: dict = {}


async def fake_check_rate_limit(key: str, max_requests: int, window_seconds: int):
    _rate_limit_counts[key] = _rate_limit_counts.get(key, 0) + 1
    if _rate_limit_counts[key] > max_requests:
        from fastapi import HTTPException
        raise HTTPException(status_code=429, detail="Rate limit exceeded")


# ── Mock Privy token verification ──

MOCK_WALLET = "0x" + "ab" * 20
MOCK_EMAIL = "test@example.com"


def make_privy_payload(wallet: str = MOCK_WALLET, email: str = MOCK_EMAIL):
    return {
        "sub": "privy:user123",
        "wallet": {"address": wallet},
        "email": {"address": email},
        "linked_accounts": [],
    }


# ── Fixtures ──

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    _fake_cache.clear()
    _rate_limit_counts.clear()
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
async def referrer_user(db_session: AsyncSession):
    """Create a referrer user in the DB."""
    user = User(
        id=uuid.uuid4(),
        username="alice",
        wallet_address="0x" + "cc" * 20,
        reputation_score=50.0,
        email="alice@test.com",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# ── Tests ──

@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.onboarding.verify_privy_token", new_callable=AsyncMock)
@patch("routers.onboarding.check_rate_limit", fake_check_rate_limit)
async def test_register_creates_user_and_returns_jwt(mock_privy, client):
    """New user registration creates user record and returns JWT + user data."""
    mock_privy.return_value = make_privy_payload()

    resp = await client.post("/onboarding/register", json={
        "privy_token": "fake-privy-token",
    })
    assert resp.status_code == 200
    data = resp.json()

    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["wallet_address"] == MOCK_WALLET.lower()
    assert data["user"]["email"] == MOCK_EMAIL
    assert data["user"]["reputation_score"] == 10.0  # signup weight


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.onboarding.verify_privy_token", new_callable=AsyncMock)
@patch("routers.onboarding.check_rate_limit", fake_check_rate_limit)
async def test_register_records_signup_reputation_event(mock_privy, client, db_session):
    """Registration creates a reputation_event with event_type='signup' and weight=10.0."""
    mock_privy.return_value = make_privy_payload()

    resp = await client.post("/onboarding/register", json={
        "privy_token": "fake-privy-token",
    })
    assert resp.status_code == 200
    user_id = resp.json()["user"]["id"]

    result = await db_session.execute(
        select(ReputationEvent).where(
            ReputationEvent.user_id == uuid.UUID(user_id),
            ReputationEvent.event_type == "signup",
        )
    )
    event = result.scalar_one_or_none()
    assert event is not None
    assert event.weight == 10.0


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.onboarding.verify_privy_token", new_callable=AsyncMock)
@patch("routers.onboarding.check_rate_limit", fake_check_rate_limit)
async def test_register_with_referrer_creates_referral(mock_privy, client, referrer_user, db_session):
    """Registration with referrerUsername creates a referral record with status 'registered'."""
    mock_privy.return_value = make_privy_payload()

    resp = await client.post("/onboarding/register", json={
        "privy_token": "fake-privy-token",
        "referrer_username": "alice",
    })
    assert resp.status_code == 200
    new_user_id = uuid.UUID(resp.json()["user"]["id"])

    result = await db_session.execute(
        select(Referral).where(
            Referral.referrer_id == referrer_user.id,
            Referral.referred_id == new_user_id,
        )
    )
    referral = result.scalar_one_or_none()
    assert referral is not None
    assert referral.status == "registered"
    assert referral.referral_code is not None


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.onboarding.verify_privy_token", new_callable=AsyncMock)
@patch("routers.onboarding.check_rate_limit", fake_check_rate_limit)
async def test_register_with_referrer_records_referrer_reputation(mock_privy, client, referrer_user, db_session):
    """Referral attribution records a reputation_event for the referrer."""
    original_score = referrer_user.reputation_score
    mock_privy.return_value = make_privy_payload()

    resp = await client.post("/onboarding/register", json={
        "privy_token": "fake-privy-token",
        "referrer_username": "alice",
    })
    assert resp.status_code == 200

    result = await db_session.execute(
        select(ReputationEvent).where(
            ReputationEvent.user_id == referrer_user.id,
            ReputationEvent.event_type == "referral_signup",
        )
    )
    event = result.scalar_one_or_none()
    assert event is not None
    assert event.weight == 5.0

    # Referrer reputation should have increased
    await db_session.refresh(referrer_user)
    assert referrer_user.reputation_score >= original_score + 5.0


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.onboarding.verify_privy_token", new_callable=AsyncMock)
@patch("routers.onboarding.check_rate_limit", fake_check_rate_limit)
async def test_self_referral_prevention(mock_privy, client, db_session):
    """A user cannot refer themselves — no referral record should be created."""
    # Create user first
    wallet = "0x" + "dd" * 20
    user = User(
        id=uuid.uuid4(),
        username="selfref",
        wallet_address=wallet,
        reputation_score=10.0,
    )
    db_session.add(user)
    await db_session.commit()

    mock_privy.return_value = make_privy_payload(wallet=wallet)

    resp = await client.post("/onboarding/register", json={
        "privy_token": "fake-privy-token",
        "referrer_username": "selfref",
    })
    # Existing user returns OK (idempotent)
    assert resp.status_code == 200

    result = await db_session.execute(
        select(Referral).where(Referral.referrer_id == user.id)
    )
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.onboarding.verify_privy_token", new_callable=AsyncMock)
@patch("routers.onboarding.check_rate_limit", fake_check_rate_limit)
async def test_referral_idempotency(mock_privy, client, referrer_user, db_session):
    """Duplicate registration with same referrer should not create duplicate referral records."""
    wallet = "0x" + "ee" * 20
    mock_privy.return_value = make_privy_payload(wallet=wallet)

    # First registration
    resp1 = await client.post("/onboarding/register", json={
        "privy_token": "fake-privy-token",
        "referrer_username": "alice",
    })
    assert resp1.status_code == 200

    # Second registration (same wallet = same user, idempotent)
    resp2 = await client.post("/onboarding/register", json={
        "privy_token": "fake-privy-token",
        "referrer_username": "alice",
    })
    assert resp2.status_code == 200

    # Should only have one referral record
    result = await db_session.execute(
        select(Referral).where(Referral.referrer_id == referrer_user.id)
    )
    referrals = result.scalars().all()
    assert len(referrals) == 1


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.onboarding.verify_privy_token", new_callable=AsyncMock)
@patch("routers.onboarding.check_rate_limit", fake_check_rate_limit)
async def test_existing_user_returns_jwt_without_duplicate(mock_privy, client, db_session):
    """Re-registering an existing wallet returns JWT for existing user, no duplicate."""
    mock_privy.return_value = make_privy_payload()

    resp1 = await client.post("/onboarding/register", json={"privy_token": "t1"})
    assert resp1.status_code == 200
    user_id_1 = resp1.json()["user"]["id"]

    resp2 = await client.post("/onboarding/register", json={"privy_token": "t2"})
    assert resp2.status_code == 200
    user_id_2 = resp2.json()["user"]["id"]

    assert user_id_1 == user_id_2

    # Only one user in DB
    result = await db_session.execute(
        select(User).where(User.wallet_address == MOCK_WALLET.lower())
    )
    users = result.scalars().all()
    assert len(users) == 1


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.onboarding.verify_privy_token", new_callable=AsyncMock)
@patch("routers.onboarding.check_rate_limit", fake_check_rate_limit)
async def test_invalid_referrer_silently_ignored(mock_privy, client, db_session):
    """Registration with a non-existent referrer username proceeds without error."""
    mock_privy.return_value = make_privy_payload()

    resp = await client.post("/onboarding/register", json={
        "privy_token": "fake-privy-token",
        "referrer_username": "nonexistent_user",
    })
    assert resp.status_code == 200

    result = await db_session.execute(select(Referral))
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.onboarding.verify_privy_token", new_callable=AsyncMock)
async def test_rate_limiting_blocks_excess_requests(mock_privy, client):
    """Rate limiting blocks more than 10 registrations per minute per IP."""
    mock_privy.return_value = make_privy_payload()

    # We need unique wallets for each request to avoid the idempotent return
    for i in range(11):
        wallet = f"0x{i:040x}"
        mock_privy.return_value = make_privy_payload(wallet=wallet)
        resp = await client.post("/onboarding/register", json={
            "privy_token": f"token-{i}",
        })
        if i < 10:
            assert resp.status_code == 200
        else:
            assert resp.status_code == 429


@pytest.mark.asyncio
@patch.object(redis_client, "cache_get", fake_cache_get)
@patch.object(redis_client, "cache_set", fake_cache_set)
@patch("routers.onboarding.verify_privy_token", new_callable=AsyncMock)
@patch("routers.onboarding.check_rate_limit", fake_check_rate_limit)
async def test_no_wallet_returns_400(mock_privy, client):
    """If Privy token has no wallet address, return 400."""
    mock_privy.return_value = {
        "sub": "privy:user123",
        "wallet": {},
        "email": {"address": "test@example.com"},
        "linked_accounts": [],
    }

    resp = await client.post("/onboarding/register", json={
        "privy_token": "fake-privy-token",
    })
    assert resp.status_code == 400
    assert "wallet" in resp.json()["detail"].lower()
