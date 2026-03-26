"""Rate limiting middleware using Redis."""
from fastapi import Request, HTTPException
from redis_client import redis


async def check_rate_limit(key: str, max_requests: int, window_seconds: int):
    """Check and increment rate limit. Raises 429 if exceeded."""
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, window_seconds)
    if current > max_requests:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {max_requests} requests per {window_seconds}s.",
        )


async def rate_limit_ip(request: Request, max_req: int = 100, window: int = 60):
    """100 requests per minute per IP (default)."""
    ip = request.client.host if request.client else "unknown"
    await check_rate_limit(f"rl:ip:{ip}", max_req, window)


async def rate_limit_auth(request: Request):
    """5 auth attempts per minute per IP."""
    ip = request.client.host if request.client else "unknown"
    await check_rate_limit(f"rl:auth:{ip}", 5, 60)


async def rate_limit_user(user_id: str, max_req: int = 1000, window: int = 3600):
    """1000 requests per hour per user (default)."""
    await check_rate_limit(f"rl:user:{user_id}", max_req, window)


async def rate_limit_poi_mint(user_id: str):
    """10 POI mints per hour per user."""
    await check_rate_limit(f"rl:poi_mint:{user_id}", 10, 3600)
