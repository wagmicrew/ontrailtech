"""Auth router — full rewrite with all five auth methods, token management, and wallet linking."""
import re
import secrets

import httpx
from eth_account.messages import encode_defunct
from fastapi import APIRouter, Depends, HTTPException, Request
from passlib.hash import bcrypt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from web3 import Web3

from config import get_settings
from database import get_db
from dependencies import get_current_user, get_user_roles
from models import AuthNonce, User, Wallet
from otp_service import otp_service
from rate_limit import rate_limit_auth, rate_limit_otp, rate_limit_register
from token_manager import token_manager

router = APIRouter()
settings = get_settings()


# ── Pydantic Schemas ──────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class RequestOTPRequest(BaseModel):
    email: str


class VerifyOTPRequest(BaseModel):
    email: str
    code: str
    purpose: str = "login"
    new_password: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: str


class GoogleAuthRequest(BaseModel):
    id_token: str


class AppleAuthRequest(BaseModel):
    identity_token: str


class ChallengeRequest(BaseModel):
    wallet_address: str


class ChallengeResponse(BaseModel):
    nonce: str
    message: str


class WalletAuthRequest(BaseModel):
    wallet_address: str
    signature: str
    message: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ConnectWalletRequest(BaseModel):
    wallet_address: str
    signature: str
    message: str


class UserData(BaseModel):
    id: str
    username: str | None
    email: str | None
    wallet_address: str | None
    avatar_url: str | None
    reputation_score: float
    roles: list[str]
    onboarding_completed: bool


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserData


# ── Helpers ───────────────────────────────────────────────────────


def validate_password(password: str) -> bool:
    """8+ chars, at least one uppercase, one lowercase, one digit."""
    if len(password) < 8:
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"[a-z]", password):
        return False
    if not re.search(r"\d", password):
        return False
    return True


async def build_auth_response(user: User, db: AsyncSession) -> AuthResponse:
    """Create tokens and build the unified auth response."""
    roles = await get_user_roles(user.id, db)
    role = roles[0] if roles else "user"

    access_token = token_manager.create_access_token(
        user_id=str(user.id),
        email=user.email,
        role=role,
        wallet_address=user.wallet_address,
    )
    refresh_token = await token_manager.create_refresh_token(str(user.id))

    user_data = UserData(
        id=str(user.id),
        username=user.username,
        email=user.email,
        wallet_address=user.wallet_address,
        avatar_url=user.avatar_url,
        reputation_score=user.reputation_score or 0.0,
        roles=roles,
        onboarding_completed=user.onboarding_completed or False,
    )
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user_data,
    )


# ── 4.1  POST /auth/register — Email + Password Registration ─────


@router.post("/register", response_model=AuthResponse)
async def register(
    req: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await rate_limit_register(request)

    # Validate password
    if not validate_password(req.password):
        raise HTTPException(
            status_code=422,
            detail="Password must be at least 8 characters with one uppercase letter, one lowercase letter, and one digit.",
        )

    email = req.email.strip().lower()

    # Check uniqueness
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Create user
    password_hash = bcrypt.using(rounds=10).hash(req.password)
    user = User(email=email, password_hash=password_hash)
    db.add(user)
    await db.flush()

    return await build_auth_response(user, db)


# ── 4.2  POST /auth/login — Email + Password Login ───────────────


@router.post("/login", response_model=AuthResponse)
async def login(
    req: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await rate_limit_auth(request)

    email = req.email.strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not bcrypt.verify(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return await build_auth_response(user, db)


# ── 4.3  OTP Endpoints ────────────────────────────────────────────


@router.post("/request-otp")
async def request_otp(
    req: RequestOTPRequest,
    db: AsyncSession = Depends(get_db),
):
    email = req.email.strip().lower()
    await rate_limit_otp(email)

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user:
        is_new_user = False
        await otp_service.generate_otp(email, purpose="login")
    else:
        # Auto-create passwordless account on first contact
        user = User(email=email)
        db.add(user)
        await db.flush()
        is_new_user = True
        await otp_service.generate_otp(email, purpose="login", email_purpose="welcome")

    return {
        "message": "A verification code has been sent to your email.",
        "is_new_user": is_new_user,
    }


@router.post("/verify-otp", response_model=AuthResponse)
async def verify_otp(
    req: VerifyOTPRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await rate_limit_auth(request)

    email = req.email.strip().lower()

    valid = await otp_service.verify_otp(email, req.code, req.purpose)
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid or expired OTP")

    # Handle password reset
    if req.purpose == "reset":
        if not req.new_password:
            raise HTTPException(status_code=422, detail="new_password is required for password reset")
        if not validate_password(req.new_password):
            raise HTTPException(
                status_code=422,
                detail="Password must be at least 8 characters with one uppercase letter, one lowercase letter, and one digit.",
            )
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired OTP")
        user.password_hash = bcrypt.using(rounds=10).hash(req.new_password)
        return await build_auth_response(user, db)

    # Handle login / auto-registration
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        user = User(email=email)
        db.add(user)
        await db.flush()

    return await build_auth_response(user, db)


# ── 4.4  POST /auth/forgot-password ──────────────────────────────


@router.post("/forgot-password")
async def forgot_password(
    req: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    email = req.email.strip().lower()
    await rate_limit_otp(email)

    # Only generate OTP if user exists (but always return 200)
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user:
        await otp_service.generate_otp(email, purpose="reset")
        # TODO: send email with reset code in production

    return {"message": "If this email is registered, a reset code has been sent."}


# ── 4.5  POST /auth/google — Google OAuth ─────────────────────────


@router.post("/google", response_model=AuthResponse)
async def google_auth(
    req: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    # Verify ID token with Google
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": req.id_token},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    data = resp.json()

    # Verify the token was issued for this application when a client ID is configured
    if settings.google_client_id and data.get("aud") != settings.google_client_id:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    google_email = data.get("email")
    google_id = data.get("sub")

    if not google_email or not google_id:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    google_email = google_email.strip().lower()

    # Find existing user by google_id or email
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        result = await db.execute(select(User).where(User.email == google_email))
        user = result.scalar_one_or_none()

    if user:
        # Link google_id if not already set
        if not user.google_id:
            user.google_id = google_id
    else:
        # Auto-create user
        user = User(email=google_email, google_id=google_id)
        db.add(user)
        await db.flush()

    return await build_auth_response(user, db)


# ── 4.5b  POST /auth/apple — Apple Sign-In ─────────────────────────


@router.post("/apple", response_model=AuthResponse)
async def apple_auth(
    req: AppleAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify Apple identity token and return AuthResponse."""
    import jwt as pyjwt
    from jwt import PyJWKClient

    try:
        # Fetch Apple's public keys and decode the identity token
        jwk_client = PyJWKClient("https://appleid.apple.com/auth/keys")
        signing_key = jwk_client.get_signing_key_from_jwt(req.identity_token)

        payload = pyjwt.decode(
            req.identity_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.apple_client_id if settings.apple_client_id else None,
            issuer="https://appleid.apple.com",
            options={
                "verify_aud": bool(settings.apple_client_id),
            },
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Apple identity token")

    apple_email = payload.get("email")
    apple_sub = payload.get("sub")

    if not apple_sub:
        raise HTTPException(status_code=401, detail="Invalid Apple identity token")

    # Find existing user by apple_id (stored in google_id field pattern) or email
    # Use a dedicated lookup: check email first, then create
    if apple_email:
        apple_email = apple_email.strip().lower()
        result = await db.execute(select(User).where(User.email == apple_email))
        user = result.scalar_one_or_none()
    else:
        user = None

    if not user:
        # Auto-create user with whatever info Apple provided
        user = User(email=apple_email)
        db.add(user)
        await db.flush()

    return await build_auth_response(user, db)


# ── 4.6  SIWE Challenge + Wallet Auth ─────────────────────────────


@router.post("/challenge", response_model=ChallengeResponse)
async def get_challenge(
    req: ChallengeRequest,
    db: AsyncSession = Depends(get_db),
):
    nonce = secrets.token_hex(32)
    wallet = req.wallet_address.lower()

    message = (
        f"{settings.siwe_domain} wants you to sign in with your Ethereum account:\n"
        f"{wallet}\n\n"
        f"Sign in to OnTrail\n\n"
        f"URI: https://{settings.siwe_domain}\n"
        f"Nonce: {nonce}"
    )

    auth_nonce = AuthNonce(wallet_address=wallet, nonce=nonce)
    db.add(auth_nonce)
    await db.flush()

    return ChallengeResponse(nonce=nonce, message=message)


@router.post("/wallet", response_model=AuthResponse)
async def wallet_auth(
    req: WalletAuthRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await rate_limit_auth(request)

    wallet = req.wallet_address.lower()

    # Verify nonce exists and is unused
    result = await db.execute(
        select(AuthNonce).where(
            AuthNonce.wallet_address == wallet,
            AuthNonce.used == False,
        ).order_by(AuthNonce.created_at.desc())
    )
    auth_nonce = result.scalar_one_or_none()
    if not auth_nonce:
        raise HTTPException(status_code=401, detail="Invalid or expired nonce")

    # Recover signer from signature
    w3 = Web3()
    msg = encode_defunct(text=req.message)
    try:
        recovered = w3.eth.account.recover_message(msg, signature=req.signature)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid signature")

    if recovered.lower() != wallet:
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Mark nonce used
    auth_nonce.used = True

    # Find or create user by wallet
    result = await db.execute(select(User).where(User.wallet_address == wallet))
    user = result.scalar_one_or_none()
    if not user:
        user = User(wallet_address=wallet)
        db.add(user)
        await db.flush()

    return await build_auth_response(user, db)


# ── 4.7  Token Refresh + Logout ───────────────────────────────────


@router.post("/refresh")
async def refresh_token(req: RefreshRequest):
    user_id = await token_manager.verify_refresh_token(req.refresh_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    access_token = token_manager.create_access_token(user_id=user_id)
    return {"access_token": access_token}


@router.post("/logout")
async def logout(req: LogoutRequest):
    await token_manager.revoke_refresh_token(req.refresh_token)
    return {"message": "Logged out successfully"}


# ── 4.8  POST /auth/connect/wallet — Link External Wallet ────────


@router.post("/connect/wallet")
async def connect_wallet(
    req: ConnectWalletRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wallet = req.wallet_address.lower()

    # Verify SIWE signature
    w3 = Web3()
    msg = encode_defunct(text=req.message)
    try:
        recovered = w3.eth.account.recover_message(msg, signature=req.signature)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid signature")

    if recovered.lower() != wallet:
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Check wallet not already linked to another user
    result = await db.execute(
        select(Wallet).where(Wallet.wallet_address == wallet)
    )
    existing = result.scalar_one_or_none()
    if existing and str(existing.user_id) != str(user.id):
        raise HTTPException(status_code=409, detail="Wallet already linked to another account")

    if not existing:
        new_wallet = Wallet(
            user_id=user.id,
            wallet_address=wallet,
            wallet_type="external",
        )
        db.add(new_wallet)
        await db.flush()

    return {"message": "Wallet connected successfully"}
