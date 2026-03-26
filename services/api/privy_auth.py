"""Privy JWT verification using JWKS endpoint."""
import httpx
from jose import jwt, jwk, JWTError
from fastapi import Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, SiteSetting
from redis_client import cache_get, cache_set

JWKS_CACHE_KEY = "privy_jwks"
JWKS_CACHE_TTL = 3600  # 1 hour


async def get_setting(db: AsyncSession, key: str) -> str | None:
    """Get a site setting value by key."""
    cached = await cache_get(f"setting:{key}")
    if cached is not None:
        return cached
    result = await db.execute(
        select(SiteSetting.setting_value).where(SiteSetting.setting_key == key)
    )
    val = result.scalar_one_or_none()
    if val is not None:
        await cache_set(f"setting:{key}", val, 300)
    return val


async def get_jwks(db: AsyncSession) -> dict:
    """Fetch and cache JWKS from Privy."""
    cached = await cache_get(JWKS_CACHE_KEY)
    if cached:
        return cached
    jwks_url = await get_setting(db, "privy_jwks_url")
    if not jwks_url:
        jwks_url = "https://auth.privy.io/api/v1/apps/cmn7iq1in001u0dl5ttvqs1pr/jwks.json"
    async with httpx.AsyncClient() as client:
        resp = await client.get(jwks_url)
        resp.raise_for_status()
        keys = resp.json()
    await cache_set(JWKS_CACHE_KEY, keys, JWKS_CACHE_TTL)
    return keys


async def verify_privy_token(token: str, db: AsyncSession) -> dict:
    """Verify a Privy-issued JWT and return the payload."""
    try:
        # Get JWKS
        jwks_data = await get_jwks(db)
        # Decode header to find kid
        unverified = jwt.get_unverified_header(token)
        kid = unverified.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="Missing kid in token header")

        # Find matching key
        rsa_key = None
        for key in jwks_data.get("keys", []):
            if key.get("kid") == kid:
                rsa_key = key
                break
        if not rsa_key:
            # Refresh JWKS cache and retry
            await cache_set(JWKS_CACHE_KEY, None, 0)
            jwks_data = await get_jwks(db)
            for key in jwks_data.get("keys", []):
                if key.get("kid") == kid:
                    rsa_key = key
                    break

        if not rsa_key:
            raise HTTPException(status_code=401, detail="No matching key found")

        privy_app_id = await get_setting(db, "privy_app_id") or "cmn7iq1in001u0dl5ttvqs1pr"

        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["ES256"],
            audience=privy_app_id,
            issuer="privy.io",
        )
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Privy token: {str(e)}")


async def get_privy_user(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Dependency: extract user from Privy JWT or legacy JWT. Returns None if no auth."""
    if not authorization:
        return None

    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization

    # Try Privy verification first
    try:
        payload = await verify_privy_token(token, db)
        privy_user_id = payload.get("sub")
        wallet = payload.get("wallet", {}).get("address") if isinstance(payload.get("wallet"), dict) else None

        if wallet:
            result = await db.execute(select(User).where(User.wallet_address == wallet.lower()))
            user = result.scalar_one_or_none()
            if user:
                return user

        # Try by privy ID stored in email field as fallback
        if privy_user_id:
            result = await db.execute(select(User).where(User.email == privy_user_id))
            user = result.scalar_one_or_none()
            if user:
                return user

        return None
    except HTTPException:
        pass

    # Fallback to legacy JWT
    from dependencies import get_current_user
    try:
        from fastapi import Request
        # Use legacy JWT decode
        from jose import jwt as jose_jwt
        from config import get_settings
        settings = get_settings()
        p = jose_jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id = p.get("sub")
        if user_id:
            result = await db.execute(select(User).where(User.id == user_id))
            return result.scalar_one_or_none()
    except Exception:
        pass

    return None
