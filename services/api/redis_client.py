import json
import functools
from typing import Optional, Any
from redis import asyncio as aioredis
from config import get_settings

settings = get_settings()

redis = aioredis.from_url(settings.redis_url, decode_responses=True)

# Cache TTL constants (seconds)
TTL_SESSION = 86400       # 24 hours
TTL_GRID_CELL = 3600      # 1 hour
TTL_REP_WEIGHTS = 3600    # 1 hour
TTL_TOKEN_PRICE = 30      # 30 seconds
TTL_NEARBY_POI = 300      # 5 minutes


async def cache_get(key: str) -> Optional[Any]:
    val = await redis.get(key)
    if val is not None:
        return json.loads(val)
    return None


async def cache_set(key: str, value: Any, ttl: int = 300):
    await redis.set(key, json.dumps(value, default=str), ex=ttl)


async def cache_delete(key: str):
    await redis.delete(key)


async def cache_delete_pattern(pattern: str):
    keys = []
    async for key in redis.scan_iter(match=pattern):
        keys.append(key)
    if keys:
        await redis.delete(*keys)


def cached(prefix: str, ttl: int = 300):
    """Decorator for caching async function results."""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = f"{prefix}:{':'.join(str(a) for a in args)}"
            result = await cache_get(cache_key)
            if result is not None:
                return result
            result = await func(*args, **kwargs)
            await cache_set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator
