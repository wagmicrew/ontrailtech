import math
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional
import h3

from database import get_db
from models import POI, GridCell, POISlot, ReputationEvent, User
from dependencies import get_current_user
from rate_limit import rate_limit_poi_mint

router = APIRouter()

H3_RESOLUTION = 9
DEFAULT_MAX_POIS = 10
DEFAULT_RARITY_DIST = {"common": 5, "rare": 3, "epic": 1, "legendary": 1}
RARITY_WEIGHTS = {"common": 1.0, "rare": 2.5, "epic": 5.0, "legendary": 10.0}


class POIResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    latitude: float
    longitude: float
    rarity: str
    owner_id: str
    distance_km: Optional[float] = None


class MintPOIRequest(BaseModel):
    name: str
    description: Optional[str] = None
    latitude: float
    longitude: float


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def get_or_create_grid_cell(db: AsyncSession, lat: float, lon: float) -> GridCell:
    h3_index = h3.latlng_to_cell(lat, lon, H3_RESOLUTION)
    result = await db.execute(select(GridCell).where(GridCell.h3_index == h3_index))
    cell = result.scalar_one_or_none()
    if cell:
        return cell

    cell = GridCell(
        h3_index=h3_index,
        resolution=H3_RESOLUTION,
        max_pois=DEFAULT_MAX_POIS,
        rarity_distribution=DEFAULT_RARITY_DIST,
    )
    db.add(cell)
    await db.flush()

    # Create POI slots
    for rarity, count in DEFAULT_RARITY_DIST.items():
        for _ in range(count):
            db.add(POISlot(grid_id=cell.id, rarity=rarity))
    await db.flush()
    return cell


@router.get("/nearby", response_model=List[POIResponse])
async def get_nearby_pois(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_km: float = Query(default=5.0),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(POI))
    all_pois = result.scalars().all()
    nearby = []
    for poi in all_pois:
        dist = haversine(lat, lon, poi.latitude, poi.longitude)
        if dist <= radius_km:
            nearby.append(POIResponse(
                id=str(poi.id), name=poi.name, description=poi.description,
                latitude=poi.latitude, longitude=poi.longitude,
                rarity=poi.rarity, owner_id=str(poi.owner_id), distance_km=round(dist, 3),
            ))
    nearby.sort(key=lambda p: p.distance_km or 0)
    return nearby


@router.post("/mint", response_model=POIResponse)
async def mint_poi(
    req: MintPOIRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if len(req.name) < 3 or len(req.name) > 100:
        raise HTTPException(status_code=400, detail="POI name must be 3-100 characters")
    if not (-90 <= req.latitude <= 90) or not (-180 <= req.longitude <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")

    await rate_limit_poi_mint(str(user.id))

    cell = await get_or_create_grid_cell(db, req.latitude, req.longitude)

    # Find available slot (legendary first)
    rarity_order = ["legendary", "epic", "rare", "common"]
    result = await db.execute(
        select(POISlot).where(POISlot.grid_id == cell.id, POISlot.occupied == False)
    )
    slots = result.scalars().all()
    if not slots:
        raise HTTPException(status_code=409, detail="No available POI slots in this grid cell")

    slots.sort(key=lambda s: rarity_order.index(s.rarity) if s.rarity in rarity_order else 99)
    slot = slots[0]

    # Create POI
    poi = POI(
        name=req.name, description=req.description,
        latitude=req.latitude, longitude=req.longitude,
        rarity=slot.rarity, owner_id=user.id, grid_id=cell.id,
    )
    db.add(poi)
    await db.flush()

    slot.occupied = True
    slot.poi_id = poi.id
    cell.current_pois_count = (cell.current_pois_count or 0) + 1

    # Record reputation event
    db.add(ReputationEvent(
        user_id=user.id, event_type="poi_minted",
        weight=RARITY_WEIGHTS.get(slot.rarity, 1.0),
        event_metadata={"poi_id": str(poi.id), "rarity": slot.rarity},
    ))
    await db.flush()

    return POIResponse(
        id=str(poi.id), name=poi.name, description=poi.description,
        latitude=poi.latitude, longitude=poi.longitude,
        rarity=poi.rarity, owner_id=str(poi.owner_id),
    )
