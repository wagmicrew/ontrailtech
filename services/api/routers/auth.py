import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from jose import jwt
from eth_account.messages import encode_defunct
from web3 import Web3

from database import get_db
from config import get_settings
from models import User, AuthNonce
from rate_limit import rate_limit_auth

router = APIRouter()
settings = get_settings()


class ChallengeRequest(BaseModel):
    wallet_address: str


class ChallengeResponse(BaseModel):
    nonce: str
    message: str


class LoginRequest(BaseModel):
    wallet_address: str
    signature: str
    nonce: str


class RegisterRequest(BaseModel):
    wallet_address: str
    signature: str
    nonce: str
    username: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


def create_token(data: dict, expires_delta: timedelta) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + expires_delta
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


@router.post("/challenge", response_model=ChallengeResponse)
async def get_challenge(req: ChallengeRequest, db: AsyncSession = Depends(get_db)):
    nonce = secrets.token_hex(32)
    message = f"Sign this message to authenticate with OnTrail.\nNonce: {nonce}"
    auth_nonce = AuthNonce(wallet_address=req.wallet_address.lower(), nonce=nonce)
    db.add(auth_nonce)
    await db.flush()
    return ChallengeResponse(nonce=nonce, message=message)


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await rate_limit_auth(request)
    # Verify nonce exists and is unused
    result = await db.execute(
        select(AuthNonce).where(
            AuthNonce.wallet_address == req.wallet_address.lower(),
            AuthNonce.nonce == req.nonce,
            AuthNonce.used == False,
        )
    )
    auth_nonce = result.scalar_one_or_none()
    if not auth_nonce:
        raise HTTPException(status_code=401, detail="Invalid or expired nonce")

    # Verify signature
    w3 = Web3()
    message = f"Sign this message to authenticate with OnTrail.\nNonce: {req.nonce}"
    msg = encode_defunct(text=message)
    try:
        recovered = w3.eth.account.recover_message(msg, signature=req.signature)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid signature")

    if recovered.lower() != req.wallet_address.lower():
        raise HTTPException(status_code=401, detail="Signature mismatch")

    # Mark nonce as used
    auth_nonce.used = True

    # Find or fail user
    result = await db.execute(select(User).where(User.wallet_address == req.wallet_address.lower()))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not registered. Please register first.")

    access_token = create_token(
        {"sub": str(user.id), "wallet": user.wallet_address},
        timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )
    refresh_token = create_token(
        {"sub": str(user.id), "type": "refresh"},
        timedelta(days=settings.jwt_refresh_token_expire_days),
    )
    return AuthResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Verify nonce
    result = await db.execute(
        select(AuthNonce).where(
            AuthNonce.wallet_address == req.wallet_address.lower(),
            AuthNonce.nonce == req.nonce,
            AuthNonce.used == False,
        )
    )
    auth_nonce = result.scalar_one_or_none()
    if not auth_nonce:
        raise HTTPException(status_code=401, detail="Invalid or expired nonce")

    # Verify signature
    w3 = Web3()
    message = f"Sign this message to authenticate with OnTrail.\nNonce: {req.nonce}"
    msg = encode_defunct(text=message)
    try:
        recovered = w3.eth.account.recover_message(msg, signature=req.signature)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid signature")

    if recovered.lower() != req.wallet_address.lower():
        raise HTTPException(status_code=401, detail="Signature mismatch")

    auth_nonce.used = True

    # Check username uniqueness
    existing = await db.execute(select(User).where(User.username == req.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(username=req.username, wallet_address=req.wallet_address.lower())
    db.add(user)
    await db.flush()

    access_token = create_token(
        {"sub": str(user.id), "wallet": user.wallet_address},
        timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )
    refresh_token = create_token(
        {"sub": str(user.id), "type": "refresh"},
        timedelta(days=settings.jwt_refresh_token_expire_days),
    )
    return AuthResponse(access_token=access_token, refresh_token=refresh_token)
