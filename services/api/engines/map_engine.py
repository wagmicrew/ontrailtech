"""Map Engine - H3 grid-based POI scarcity and geospatial operations."""
import math
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import h3

from models import GridCell, POISlot, POI

H3_RESOLUTION = 9
DEFAULT_MAX_POIS = 10
DEFAULT_RARITY_DIST = {"common": 5, "rare": 3, "epic": 1, "legendary": 1}
RARITY_ORDER = ["legendary", "epic", "rare", "common"]


def get_h3_cell(lat: float, lon: float, resolution: int = H3_RESOLUTION) -> str:
    return h3.latlng_to_cell(lat, lon, resolution)


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def get_or_create_grid_cell(db: AsyncSession, lat: float, lon: float) -> GridCell:
    h3_index = get_h3_cell(lat, lon)
    result = await db.execute(select(GridCell).where(GridCell.h3_index == h3_index))
    cell = result.scalar_one_or_none()
    if cell:
        return cell
    cell = GridCell(
        h3_index=h3_index, resolution=H3_RESOLUTION,
        max_pois=DEFAULT_MAX_POIS, rarity_distribution=DEFAULT_RARITY_DIST,
    )
    db.add(cell)
    await db.flush()
    for rarity, count in DEFAULT_RARITY_DIST.items():
        for _ in range(count):
            db.add(POISlot(grid_id=cell.id, rarity=rarity))
    await db.flush()
    return cell


async def get_available_slots(db: AsyncSession, grid_id) -> List[POISlot]:
    result = await db.execute(
        select(POISlot).where(POISlot.grid_id == grid_id, POISlot.occupied == False)
    )
    slots = result.scalars().all()
    slots.sort(key=lambda s: RARITY_ORDER.index(s.rarity) if s.rarity in RARITY_ORDER else 99)
    return slots


async def get_nearby_pois(
    db: AsyncSession, lat: float, lon: float, radius_km: float
) -> List[dict]:
    result = await db.execute(select(POI))
    all_pois = result.scalars().all()
    nearby = []
    for poi in all_pois:
        dist = haversine(lat, lon, poi.latitude, poi.longitude)
        if dist <= radius_km:
            nearby.append({
                "id": str(poi.id), "name": poi.name,
                "description": poi.description,
                "latitude": poi.latitude, "longitude": poi.longitude,
                "rarity": poi.rarity, "owner_id": str(poi.owner_id),
                "distance_km": round(dist, 3),
            })
    nearby.sort(key=lambda p: p["distance_km"])
    return nearby


async def validate_poi_mint(
    db: AsyncSession, lat: float, lon: float
) -> Optional[POISlot]:
    cell = await get_or_create_grid_cell(db, lat, lon)
    slots = await get_available_slots(db, cell.id)
    return slots[0] if slots else None
