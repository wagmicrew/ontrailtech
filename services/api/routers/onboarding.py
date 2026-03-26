"""Onboarding registration endpoint for first-time user journey."""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt

from database import get_db
from config import get_settings
from models import User, ReputationEvent, Referral
from privy_auth import verify_privy_token
from rate_limit import check_rate_limit

router = APIRouter()
settings = get_settings()

SIGNUP_REPUTATION_WEIGHT = 10.0
REFERRAL_SIGNUP_REPUTATION_WEIGHT = 5.0


# ── Pydantic models ──

class OnboardingRegisterRequest(BaseModel):
    privy_token: str
    referrer_username: Optional[str] = None
    runner_context: Optional[str] = None


class UserData(BaseModel):
    id: str
    username: Optional[str]
    wallet_address: str
    email: Optional[str]
    reputation_score: float


class OnboardingRegisterResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserData


# ── Helpers ──

def _create_token(data: dict, expires_delta: timedelta) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + expires_delta
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def _generate_referral_code() -> str:
    """Generate a cryptographically random referral code."""
    return secrets.token_urlsafe(12)


# ── Endpoint ──

@router.post("/register", response_model=OnboardingRegisterResponse)
async def register_onboarding(
    req: OnboardingRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user via Privy authentication.
    - Validates Privy JWT server-side
    - Creates user record with wallet + email
    - Records reputation_event for signup
    - Handles referral attribution with self-referral prevention and idempotency
    - Returns JWT + user data
    """
    # Rate limit: 10 registrations per minute per IP
    ip = request.client.host if request.client else "unknown"
    await check_rate_limit(f"rl:onboarding:{ip}", 10, 60)

    # Validate Privy token server-side
    privy_payload = await verify_privy_token(req.privy_token, db)

    # Extract wallet and email from Privy payload
    wallet_info = privy_payload.get("wallet", {})
    wallet_address = (
        wallet_info.get("address", "").lower()
        if isinstance(wallet_info, dict)
        else ""
    )
    if not wallet_address:
        # Try linked_accounts for wallet
        for acct in privy_payload.get("linked_accounts", []):
            if acct.get("type") == "wallet" and acct.get("address"):
                wallet_address = acct["address"].lower()
                break

    if not wallet_address:
        raise HTTPException(status_code=400, detail="No wallet address found in Privy token")

    email = privy_payload.get("email", {}).get("address") if isinstance(privy_payload.get("email"), dict) else None
    if not email:
        for acct in privy_payload.get("linked_accounts", []):
            if acct.get("type") == "email" and acct.get("address"):
                email = acct["address"]
                break

    # Check if user already exists (idempotent — return existing user)
    result = await db.execute(
        select(User).where(User.wallet_address == wallet_address)
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        # User already registered — return JWT for existing user
        access_token = _create_token(
            {"sub": str(existing_user.id), "wallet": existing_user.wallet_address},
            timedelta(minutes=settings.jwt_access_token_expire_minutes),
        )
        refresh_token = _create_token(
            {"sub": str(existing_user.id), "type": "refresh"},
            timedelta(days=settings.jwt_refresh_token_expire_days),
        )
        return OnboardingRegisterResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserData(
                id=str(existing_user.id),
                username=existing_user.username,
                wallet_address=existing_user.wallet_address,
                email=existing_user.email,
                reputation_score=existing_user.reputation_score or 0.0,
            ),
        )

    # Create new user (username is set later during identity claim phase)
    # Generate a temporary unique username from wallet address
    temp_username = f"user_{wallet_address[:8]}"
    # Ensure uniqueness
    check = await db.execute(select(User).where(User.username == temp_username))
    if check.scalar_one_or_none():
        temp_username = f"user_{secrets.token_hex(4)}"

    new_user = User(
        username=temp_username,
        wallet_address=wallet_address,
        email=email,
        reputation_score=0.0,
    )
    db.add(new_user)
    await db.flush()

    # Record reputation_event for signup
    signup_event = ReputationEvent(
        user_id=new_user.id,
        event_type="signup",
        weight=SIGNUP_REPUTATION_WEIGHT,
        event_metadata={"source": "onboarding", "runner_context": req.runner_context},
    )
    db.add(signup_event)

    # Update reputation score (monotonic: only increase)
    new_user.reputation_score = max(
        (new_user.reputation_score or 0.0) + SIGNUP_REPUTATION_WEIGHT, 0.0
    )

    # Handle referral attribution
    if req.referrer_username:
        await _process_referral(
            db=db,
            new_user=new_user,
            referrer_username=req.referrer_username,
            runner_context=req.runner_context,
        )

    await db.flush()

    # Generate JWT tokens
    access_token = _create_token(
        {"sub": str(new_user.id), "wallet": new_user.wallet_address},
        timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )
    refresh_token = _create_token(
        {"sub": str(new_user.id), "type": "refresh"},
        timedelta(days=settings.jwt_refresh_token_expire_days),
    )

    return OnboardingRegisterResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserData(
            id=str(new_user.id),
            username=new_user.username,
            wallet_address=new_user.wallet_address,
            email=new_user.email,
            reputation_score=new_user.reputation_score or 0.0,
        ),
    )


async def _process_referral(
    db: AsyncSession,
    new_user: User,
    referrer_username: str,
    runner_context: Optional[str],
) -> None:
    """
    Process referral attribution:
    - Look up referrer by username
    - Enforce self-referral prevention
    - Enforce idempotency (no duplicate referral records)
    - Create referral record with status 'registered'
    - Record reputation_event for referrer
    """
    # Look up referrer
    result = await db.execute(
        select(User).where(User.username == referrer_username.lower())
    )
    referrer = result.scalar_one_or_none()
    if not referrer:
        # Silently ignore invalid referrer (per Error Scenario 6 in design)
        return

    # Self-referral prevention
    if referrer.id == new_user.id:
        return

    # Idempotency: check if referral record already exists
    existing_referral = await db.execute(
        select(Referral).where(
            Referral.referrer_id == referrer.id,
            Referral.referred_id == new_user.id,
        )
    )
    if existing_referral.scalar_one_or_none():
        # Already attributed — skip silently
        return

    # Create referral record
    referral = Referral(
        referrer_id=referrer.id,
        referred_id=new_user.id,
        referral_code=_generate_referral_code(),
        runner_context=runner_context,
        status="registered",
    )
    db.add(referral)

    # Record reputation_event for referrer
    referral_event = ReputationEvent(
        user_id=referrer.id,
        event_type="referral_signup",
        weight=REFERRAL_SIGNUP_REPUTATION_WEIGHT,
        event_metadata={
            "referred_user_id": str(new_user.id),
            "runner_context": runner_context,
        },
    )
    db.add(referral_event)

    # Update referrer reputation score (monotonic increase, floor at 0.0)
    referrer.reputation_score = max(
        (referrer.reputation_score or 0.0) + REFERRAL_SIGNUP_REPUTATION_WEIGHT, 0.0
    )
