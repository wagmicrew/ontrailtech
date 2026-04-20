import json
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
    build_mode: str = "manual"
    is_loop: bool = False
    is_minted: bool = False
    route_points: list[dict] = []
    checkpoints: list[dict] = []


class RouteResponse(BaseModel):
    id: str
    name: str
    difficulty: str
    distance_km: float
    completion_count: int
    description: Optional[str] = None
    creator_username: Optional[str] = None
    build_mode: Optional[str] = None
    is_loop: bool = False
    is_minted: bool = False
    poi_count: int = 0
    start_poi_name: Optional[str] = None
    end_poi_name: Optional[str] = None


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


def _extract_route_metadata(route: Route) -> dict:
    if not route.description:
        return {}
    try:
        parsed = json.loads(route.description)
        return parsed if isinstance(parsed, dict) else {"summary": route.description}
    except Exception:
        return {"summary": route.description}


def _poi_overlap_score(existing: list[str], incoming: list[str]) -> float:
    existing_set = {item for item in existing if item}
    incoming_set = {item for item in incoming if item}
    if not existing_set or not incoming_set:
        return 0.0
    return len(existing_set & incoming_set) / max(len(existing_set), len(incoming_set))


async def _serialize_route(route: Route, db: AsyncSession) -> RouteResponse:
    meta = _extract_route_metadata(route)

    creator_username = await db.scalar(
        select(User.username).where(User.id == route.creator_id)
    )

    poi_rows = await db.execute(
        select(RoutePOI.position, POI.name)
        .join(POI, POI.id == RoutePOI.poi_id)
        .where(RoutePOI.route_id == route.id)
        .order_by(RoutePOI.position)
    )
    ordered_pois = poi_rows.all()

    return RouteResponse(
        id=str(route.id),
        name=route.name,
        difficulty=route.difficulty,
        distance_km=route.distance_km,
        completion_count=route.completion_count or 0,
        description=meta.get("summary") or route.description,
        creator_username=creator_username,
        build_mode=meta.get("build_mode", "manual"),
        is_loop=bool(meta.get("is_loop", False)),
        is_minted=bool(meta.get("is_minted", False)),
        poi_count=len(ordered_pois),
        start_poi_name=ordered_pois[0][1] if ordered_pois else None,
        end_poi_name=ordered_pois[-1][1] if ordered_pois else None,
    )


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
    if req.build_mode not in {"auto", "manual"}:
        raise HTTPException(status_code=400, detail="build_mode must be auto or manual")

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

    if req.is_minted:
        existing_routes = (await db.execute(select(Route))).scalars().all()
        for existing_route in existing_routes:
            existing_meta = _extract_route_metadata(existing_route)
            if not existing_meta.get("is_minted"):
                continue

            existing_poi_ids = [
                str(pid)
                for pid in (
                    await db.execute(
                        select(RoutePOI.poi_id).where(RoutePOI.route_id == existing_route.id)
                    )
                ).scalars().all()
            ]
            if _poi_overlap_score(existing_poi_ids, req.poi_ids) >= 0.8:
                raise HTTPException(
                    status_code=409,
                    detail="This route overlaps too closely with an existing minted route.",
                )

    route_metadata = {
        "summary": req.description,
        "build_mode": req.build_mode,
        "is_loop": req.is_loop,
        "is_minted": req.is_minted,
        "route_points": req.route_points,
        "checkpoints": req.checkpoints,
        "poi_ids": req.poi_ids,
    }

    route = Route(
        name=req.name,
        description=json.dumps(route_metadata),
        creator_id=user.id,
        difficulty=req.difficulty,
        distance_km=round(total_distance, 2),
        estimated_duration_min=req.estimated_duration_min,
    )
    db.add(route)
    await db.flush()

    for i, pid in enumerate(req.poi_ids):
        db.add(RoutePOI(route_id=route.id, poi_id=pid, position=i))

    db.add(ReputationEvent(
        user_id=user.id,
        event_type="route_created",
        weight=2.0,
        event_metadata={
            "route_id": str(route.id),
            "build_mode": req.build_mode,
            "is_minted": req.is_minted,
        },
    ))
    await db.flush()

    return await _serialize_route(route, db)


@router.get("/mine", response_model=list[RouteResponse])
async def list_my_routes(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Route).where(Route.creator_id == user.id).order_by(Route.created_at.desc())
    )
    routes = result.scalars().all()
    return [await _serialize_route(route, db) for route in routes]


@router.get("/by-runner/{username}", response_model=list[RouteResponse])
async def list_routes_by_runner(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    owner = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not owner:
        raise HTTPException(status_code=404, detail="Runner not found")

    result = await db.execute(
        select(Route).where(Route.creator_id == owner.id).order_by(Route.created_at.desc())
    )
    routes = result.scalars().all()
    return [await _serialize_route(route, db) for route in routes]


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
        event_metadata={"route_id": str(route.id)},
    ))
    await db.flush()

    return {"route_nft_id": str(route_nft.id), "completion_count": route.completion_count}
