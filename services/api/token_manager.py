"""JWT access token and Redis-backed refresh token management."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from config import get_settings
from redis_client import redis


class TokenManager:
    """Issue, verify, and revoke JWT access tokens and Redis refresh tokens."""

    def __init__(self):
        self._settings = get_settings()

    # ── Access tokens ──────────────────────────────────────────────

    def create_access_token(
        self,
        user_id: str,
        email: Optional[str] = None,
        role: str = "user",
        wallet_address: Optional[str] = None,
    ) -> str:
        """Create an HS256 JWT with 30-day TTL."""
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(user_id),
            "email": email or "",
            "role": role,
            "wallet_address": wallet_address or "",
            "iat": int(now.timestamp()),
            "exp": int(
                (now + timedelta(minutes=self._settings.jwt_access_token_expire_minutes)).timestamp()
            ),
        }
        return jwt.encode(
            payload,
            self._settings.jwt_secret_key,
            algorithm=self._settings.jwt_algorithm,
        )

    # ── Refresh tokens (Redis-backed) ─────────────────────────────

    async def create_refresh_token(self, user_id: str) -> str:
        """Generate a UUID refresh token and store in Redis with 30-day TTL."""
        token = str(uuid.uuid4())
        ttl = self._settings.jwt_refresh_token_expire_days * 86400  # seconds
        await redis.set(f"refresh_token:{token}", str(user_id), ex=ttl)
        return token

    async def verify_refresh_token(self, token: str) -> Optional[str]:
        """Return the user_id associated with the refresh token, or None."""
        user_id = await redis.get(f"refresh_token:{token}")
        return user_id

    async def revoke_refresh_token(self, token: str) -> None:
        """Delete a single refresh token from Redis."""
        await redis.delete(f"refresh_token:{token}")

    async def revoke_all_user_tokens(self, user_id: str) -> None:
        """Scan and delete all refresh tokens belonging to a user."""
        user_id_str = str(user_id)
        keys_to_delete = []
        async for key in redis.scan_iter(match="refresh_token:*"):
            val = await redis.get(key)
            if val == user_id_str:
                keys_to_delete.append(key)
        if keys_to_delete:
            await redis.delete(*keys_to_delete)


token_manager = TokenManager()
