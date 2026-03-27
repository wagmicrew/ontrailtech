"""Onboarding endpoints — wallet creation, auto-follow, and completion."""
import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from dependencies import get_current_user
from models import Friend, Referral, ReputationEvent, User, Wallet
from wallet_service import wallet_service

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

SIGNUP_REPUTATION_WEIGHT = 10.0
REFERRAL_SIGNUP_REPUTATION_WEIGHT = 5.0


# ── Pydantic models ──


class CreateWalletResponse(BaseModel):
    wallet_address: str


# ── Helpers ──


def _generate_referral_code() -> str:
    """Generate a cryptographically random referral code."""
    return secrets.token_urlsafe(12)


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
    result = await db.execute(
        select(User).where(User.username == referrer_username.lower())
    )
    referrer = result.scalar_one_or_none()
    if not referrer:
        return

    if referrer.id == new_user.id:
        return

    existing_referral = await db.execute(
        select(Referral).where(
            Referral.referrer_id == referrer.id,
            Referral.referred_id == new_user.id,
        )
    )
    if existing_referral.scalar_one_or_none():
        return

    referral = Referral(
        referrer_id=referrer.id,
        referred_id=new_user.id,
        referral_code=_generate_referral_code(),
        runner_context=runner_context,
        status="registered",
    )
    db.add(referral)

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

    referrer.reputation_score = max(
        (referrer.reputation_score or 0.0) + REFERRAL_SIGNUP_REPUTATION_WEIGHT, 0.0
    )


# ── Endpoints ──


@router.post("/create-wallet", response_model=CreateWalletResponse)
async def create_wallet(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a profile wallet, encrypt key, store in wallets table, update user."""
    try:
        address, private_key_hex = wallet_service.generate_wallet()
        encrypted_key = wallet_service.encrypt_private_key(private_key_hex)
    except Exception:
        logger.exception("Wallet generation failed for user %s", user.id)
        raise HTTPException(status_code=500, detail="Wallet creation failed")

    wallet = Wallet(
        user_id=user.id,
        wallet_address=address,
        wallet_type="profile",
        encrypted_private_key=encrypted_key,
    )
    db.add(wallet)
    user.wallet_address = address
    await db.flush()

    return CreateWalletResponse(wallet_address=address)


@router.post("/auto-follow")
async def auto_follow(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create friend rows for Ancient_Owner and Founders_DAO, record signup reputation event."""
    for username in ("ancient_owner", "founders_dao"):
        result = await db.execute(
            select(User).where(User.username == username)
        )
        target = result.scalar_one_or_none()
        if not target:
            logger.warning("Auto-follow target '%s' not found, skipping", username)
            continue

        friend = Friend(user_id=user.id, friend_id=target.id)
        db.add(friend)

    # Record signup reputation event
    signup_event = ReputationEvent(
        user_id=user.id,
        event_type="signup",
        weight=SIGNUP_REPUTATION_WEIGHT,
        event_metadata={"source": "onboarding"},
    )
    db.add(signup_event)
    user.reputation_score = max(
        (user.reputation_score or 0.0) + SIGNUP_REPUTATION_WEIGHT, 0.0
    )
    await db.flush()

    return {"message": "Auto-follow complete"}


@router.post("/complete")
async def complete_onboarding(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark onboarding as completed."""
    user.onboarding_completed = True
    await db.flush()
    return {"message": "Onboarding completed"}
