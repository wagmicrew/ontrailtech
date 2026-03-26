import math
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional

from database import get_db
from models import Route, RoutePOI, POI, ActivitySession, Checkin, RouteNFT, ReputationEvent, User
from dependencies import get_current_user
from routers.pois import haversine

router = APIRouter()

DIFFICULTY_WEIGHTS = {"easy": 1.0, "moderate": 2.0, "hard": 4.0, "expert": 8.0}


class CreateRouteRequest(BaseModel):
    name: str
    description: Optional[str] = None
    difficulty: str = "moderate"
    estimated_duration_min: int = 60
    poi_ids: List[str]


class RouteResponse(BaseModel):
    id: str
    name: str
    difficulty: str
    distance_km: float
    completion_count: int


class StartRouteRequest(BaseModel):
    route_id: str


class CheckinRequest(BaseModel):
    poi_id: str
    session_id: str
    latitude: float
    longitude: float


class CompleteRouteRequest(BaseModel):
    route_id: str
    session_id: str


@router.post("/create", response_model=RouteResponse)
async def create_route(
    req: CreateRouteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if len(req.name) < 3 or len(req.name) > 100:
        raise HTTPException(status_code=400, detail="Route name must be 3-100 characters")
    if len(req.poi_ids) < 2:
        raise HTTPException(status_code=400, detail="Route must include at least 2 POIs")
    if req.difficulty not in DIFFICULTY_WEIGHTS:
        raise HTTPException(status_code=400, detail="Invalid difficulty level")

    # Validate POIs exist and calculate distance
    pois = []
    for pid in req.poi_ids:
        result = await db.execute(select(POI).where(POI.id == pid))
        poi = result.scalar_one_or_none()
        if not poi:
            raise HTTPException(status_code=400, detail=f"POI {pid} not found")
        pois.append(poi)

    total_distance = sum(
        haversine(pois[i].latitude, pois[i].longitude, pois[i + 1].latitude, pois[i + 1].longitude)
        for i in range(len(pois) - 1)
    )

    route = Route(
        name=req.name, description=req.description, creator_id=user.id,
        difficulty=req.difficulty, distance_km=round(total_distance, 2),
        estimated_duration_min=req.estimated_duration_min,
    )
    db.add(route)
    await db.flush()

    for i, pid in enumerate(req.poi_ids):
        db.add(RoutePOI(route_id=route.id, poi_id=pid, position=i))
    await db.flush()

    return RouteResponse(
        id=str(route.id), name=route.name, difficulty=route.difficulty,
        distance_km=route.distance_km, completion_count=0,
    )


@router.post("/start")
async def start_route(
    req: StartRouteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Route).where(Route.id == req.route_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Route not found")

    session = ActivitySession(user_id=user.id, route_id=req.route_id)
    db.add(session)
    await db.flush()
    return {"session_id": str(session.id), "status": "active"}


@router.post("/checkin")
async def checkin_poi(
    req: CheckinRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(POI).where(POI.id == req.poi_id))
    poi = result.scalar_one_or_none()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")

    dist_m = haversine(req.latitude, req.longitude, poi.latitude, poi.longitude) * 1000
    if dist_m > 50:
        raise HTTPException(status_code=400, detail=f"Too far from POI ({dist_m:.0f}m). Must be within 50m.")

    checkin = Checkin(
        user_id=user.id, poi_id=req.poi_id, session_id=req.session_id,
        latitude=req.latitude, longitude=req.longitude,
    )
    db.add(checkin)
    await db.flush()
    return {"checkin_id": str(checkin.id), "distance_m": round(dist_m, 1)}


@router.post("/complete")
async def complete_route(
    req: CompleteRouteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Route).where(Route.id == req.route_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    # Get route POIs
    result = await db.execute(
        select(RoutePOI).where(RoutePOI.route_id == req.route_id).order_by(RoutePOI.position)
    )
    route_pois = result.scalars().all()
    required_poi_ids = {str(rp.poi_id) for rp in route_pois}

    # Get checkins for this session
    result = await db.execute(
        select(Checkin).where(Checkin.session_id == req.session_id, Checkin.user_id == user.id)
    )
    checkins = result.scalars().all()
    checked_poi_ids = {str(c.poi_id) for c in checkins}

    missing = required_poi_ids - checked_poi_ids
    if missing:
        # Resolve names
        names = []
        for pid in missing:
            r = await db.execute(select(POI.name).where(POI.id == pid))
            n = r.scalar_one_or_none()
            names.append(n or pid)
        raise HTTPException(status_code=400, detail=f"Missing check-ins for: {', '.join(names)}")

    # Mint Route NFT (placeholder)
    route_nft = RouteNFT(route_id=route.id, user_id=user.id)
    db.add(route_nft)
    route.completion_count = (route.completion_count or 0) + 1

    db.add(ReputationEvent(
        user_id=user.id, event_type="route_completed",
        weight=DIFFICULTY_WEIGHTS.get(route.difficulty, 1.0),
        metadata={"route_id": str(route.id)},
    ))
    await db.flush()

    return {"route_nft_id": str(route_nft.id), "completion_count": route.completion_count}
