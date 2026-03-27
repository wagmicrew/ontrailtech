"""Aura serialization helpers — round-trip consistency for Redis cache and API responses.

Numeric fields (total_aura, weighted_aura) are serialized as strings to preserve
Decimal precision through JSON round-trips. Required fields are validated on
deserialization so callers can fall back to DB when cached data is corrupt.
"""
import logging
from decimal import Decimal, InvalidOperation
from typing import Optional

logger = logging.getLogger(__name__)

# Fields that must be present and non-empty in cached aura data
REQUIRED_FIELDS = ("total_aura", "aura_level")

# Numeric fields serialized as strings for precision
NUMERIC_FIELDS = ("total_aura", "weighted_aura")


def serialize_aura(aura_index) -> dict:
    """Serialize an AuraIndex ORM record to a dict suitable for Redis/JSON.

    Numeric fields are converted to strings to preserve Decimal precision.
    Returns a plain dict ready for ``json.dumps``.
    """
    return {
        "total_aura": str(aura_index.total_aura),
        "weighted_aura": str(aura_index.weighted_aura),
        "ancient_supporter_count": aura_index.ancient_supporter_count,
        "aura_level": aura_index.aura_level,
    }


def serialize_aura_values(
    total_aura,
    weighted_aura,
    supporter_count: int,
    aura_level: str,
) -> dict:
    """Serialize raw aura values (Decimal/int/str) to a cache-ready dict.

    Convenience wrapper when you don't have an ORM object.
    """
    return {
        "total_aura": str(total_aura),
        "weighted_aura": str(weighted_aura),
        "ancient_supporter_count": supporter_count,
        "aura_level": aura_level,
    }


def validate_aura_cache(cached_dict: dict) -> bool:
    """Check that *cached_dict* contains all required fields with valid values.

    Returns ``True`` when the dict is usable, ``False`` otherwise.
    """
    if not isinstance(cached_dict, dict):
        return False

    for field in REQUIRED_FIELDS:
        if field not in cached_dict or cached_dict[field] is None:
            return False

    # Verify numeric fields can be parsed back to Decimal
    for field in NUMERIC_FIELDS:
        if field in cached_dict:
            try:
                Decimal(str(cached_dict[field]))
            except (InvalidOperation, ValueError, TypeError):
                return False

    return True


def deserialize_aura(cached_dict: dict) -> Optional[dict]:
    """Validate and normalise a cached aura dict.

    Returns a cleaned dict with Numeric string fields intact (for API
    responses) or ``None`` if validation fails — signalling the caller
    should fall back to the database.
    """
    if not validate_aura_cache(cached_dict):
        logger.warning("Invalid aura cache data, falling back to DB: %s", cached_dict)
        return None

    return {
        "total_aura": str(cached_dict["total_aura"]),
        "weighted_aura": str(cached_dict.get("weighted_aura", "0")),
        "ancient_supporter_count": cached_dict.get("ancient_supporter_count", 0),
        "aura_level": cached_dict["aura_level"],
    }
