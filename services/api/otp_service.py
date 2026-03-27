"""OTP generation and verification backed by Redis."""
import json
import secrets

from redis_client import redis

OTP_TTL = 900  # 15 minutes in seconds


class OTPService:
    """Generate and verify 6-digit one-time passwords stored in Redis."""

    async def generate_otp(self, email: str, purpose: str = "login") -> str:
        """Generate a 6-digit OTP, invalidate any previous one, and store with 15-min TTL."""
        key = f"otp:{email}"
        code = f"{secrets.randbelow(1_000_000):06d}"
        await redis.delete(key)
        await redis.set(key, json.dumps({"code": code, "purpose": purpose}), ex=OTP_TTL)
        return code

    async def verify_otp(self, email: str, code: str, purpose: str = "login") -> bool:
        """Verify the OTP code and purpose. Deletes on success (single-use)."""
        key = f"otp:{email}"
        raw = await redis.get(key)
        if raw is None:
            return False
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return False
        if data.get("code") == code and data.get("purpose") == purpose:
            await redis.delete(key)
            return True
        return False


otp_service = OTPService()
