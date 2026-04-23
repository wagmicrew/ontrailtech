"""POI-Fi — passive income for POI owners via check-in rewards and marketplace."""
import uuid as uuid_mod
import logging
from decimal import Decimal
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel

from database import get_db
from models import POI, POIReward, POIListing, Checkin, User
from dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

# Reward per check-in (in ETH equivalent, off-chain accounting)
CHECKIN_REWARD_ETH = Decimal("0.0001")
# Marketplace fee taken by platform (5%)
MARKETPLACE_FEE_PCT = Decimal("0.05")


# ── Response models ──

class POIWithStats(BaseModel):
    poi_id: str
    name: str
    description: Optional[str]
    latitude: float
    longitude: float
    rarity: str
    checkin_count: int
    pending_rewards_eth: str
    pending_rewards_fiat: str
    listed_for_sale: bool
    listing_price_eth: Optional[str]
    listing_id: Optional[str]


class RewardSummary(BaseModel):
    total_pending_eth: str
    total_pending_fiat: str
    total_claimed_eth: str
    unclaimed_count: int
    poi_count: int


class ListingOut(BaseModel):
    listing_id: str
    poi_id: str
    poi_name: str
    poi_rarity: str
    poi_latitude: float
    poi_longitude: float
    seller_id: str
    seller_username: Optional[str]
    price_eth: str
    price_fiat: str
    created_at: str


class CreateListingRequest(BaseModel):
    poi_id: str
    price_eth: float


ETH_USD_RATE = 3000.0


# ── My POIs ──

@router.get("/my-pois", response_model=List[POIWithStats])
async def get_my_pois(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return user's owned POIs with check-in count and pending reward info."""
    result = await db.execute(select(POI).where(POI.owner_id == user.id))
    pois = result.scalars().all()

    output = []
    for poi in pois:
        # Count total check-ins
        checkin_count = await db.scalar(
            select(func.count(Checkin.id)).where(Checkin.poi_id == poi.id)
        ) or 0

        # Pending rewards
        pending_eth = await db.scalar(
            select(func.sum(POIReward.reward_amount_eth))
            .where(POIReward.poi_id == poi.id, POIReward.claimed == False)
        ) or Decimal("0")

        # Active listing?
        listing_result = await db.execute(
            select(POIListing).where(POIListing.poi_id == poi.id, POIListing.status == "active")
        )
        listing = listing_result.scalar_one_or_none()

        output.append(POIWithStats(
            poi_id=str(poi.id),
            name=poi.name,
            description=poi.description,
            latitude=poi.latitude,
            longitude=poi.longitude,
            rarity=poi.rarity,
            checkin_count=int(checkin_count),
            pending_rewards_eth=f"{float(pending_eth):.6f}",
            pending_rewards_fiat=f"${float(pending_eth) * ETH_USD_RATE:.2f}",
            listed_for_sale=listing is not None,
            listing_price_eth=str(listing.price_eth) if listing else None,
            listing_id=str(listing.id) if listing else None,
        ))
    return output


# ── Reward summary ──

@router.get("/rewards/summary", response_model=RewardSummary)
async def get_reward_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated reward stats across all POIs owned by the user."""
    pending_eth = await db.scalar(
        select(func.sum(POIReward.reward_amount_eth))
        .where(POIReward.owner_id == user.id, POIReward.claimed == False)
    ) or Decimal("0")

    claimed_eth = await db.scalar(
        select(func.sum(POIReward.reward_amount_eth))
        .where(POIReward.owner_id == user.id, POIReward.claimed == True)
    ) or Decimal("0")

    unclaimed_count = await db.scalar(
        select(func.count(POIReward.id))
        .where(POIReward.owner_id == user.id, POIReward.claimed == False)
    ) or 0

    poi_count = await db.scalar(
        select(func.count(POI.id)).where(POI.owner_id == user.id)
    ) or 0

    return RewardSummary(
        total_pending_eth=f"{float(pending_eth):.6f}",
        total_pending_fiat=f"${float(pending_eth) * ETH_USD_RATE:.2f}",
        total_claimed_eth=f"{float(claimed_eth):.6f}",
        unclaimed_count=int(unclaimed_count),
        poi_count=int(poi_count),
    )


# ── Claim rewards ──

@router.post("/rewards/claim")
async def claim_rewards(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all pending rewards as claimed (off-chain accounting; on-chain payout handled separately)."""
    result = await db.execute(
        select(POIReward).where(POIReward.owner_id == user.id, POIReward.claimed == False)
    )
    unclaimed = result.scalars().all()
    if not unclaimed:
        raise HTTPException(status_code=400, detail="No unclaimed rewards")

    total_eth = Decimal("0")
    now = datetime.utcnow()
    for reward in unclaimed:
        reward.claimed = True
        reward.claimed_at = now
        total_eth += Decimal(str(reward.reward_amount_eth))

    await db.commit()
    return {
        "claimed_count": len(unclaimed),
        "total_eth": f"{float(total_eth):.6f}",
        "total_fiat": f"${float(total_eth) * ETH_USD_RATE:.2f}",
    }


# ── Marketplace ──

@router.get("/marketplace", response_model=List[ListingOut])
async def get_marketplace(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Browse active POI listings."""
    result = await db.execute(
        select(POIListing, POI, User)
        .join(POI, POI.id == POIListing.poi_id)
        .join(User, User.id == POIListing.seller_id)
        .where(POIListing.status == "active")
        .order_by(POIListing.created_at.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        ListingOut(
            listing_id=str(listing.id),
            poi_id=str(poi.id),
            poi_name=poi.name,
            poi_rarity=poi.rarity,
            poi_latitude=poi.latitude,
            poi_longitude=poi.longitude,
            seller_id=str(listing.seller_id),
            seller_username=seller.username,
            price_eth=str(listing.price_eth),
            price_fiat=f"${float(listing.price_eth) * ETH_USD_RATE:.2f}",
            created_at=listing.created_at.isoformat(),
        )
        for listing, poi, seller in rows
    ]


@router.post("/marketplace/list", response_model=ListingOut)
async def create_listing(
    req: CreateListingRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List a POI for sale on the marketplace."""
    try:
        poi_uuid = uuid_mod.UUID(req.poi_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="POI not found")

    poi_result = await db.execute(select(POI).where(POI.id == poi_uuid))
    poi = poi_result.scalar_one_or_none()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")
    if str(poi.owner_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not your POI")
    if req.price_eth <= 0:
        raise HTTPException(status_code=400, detail="Price must be positive")

    # Cancel any existing active listing for this POI
    existing_result = await db.execute(
        select(POIListing).where(POIListing.poi_id == poi.id, POIListing.status == "active")
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        existing.status = "cancelled"

    listing = POIListing(
        poi_id=poi.id,
        seller_id=user.id,
        price_eth=Decimal(str(req.price_eth)),
    )
    db.add(listing)
    await db.flush()
    await db.commit()
    await db.refresh(listing)

    return ListingOut(
        listing_id=str(listing.id),
        poi_id=str(poi.id),
        poi_name=poi.name,
        poi_rarity=poi.rarity,
        poi_latitude=poi.latitude,
        poi_longitude=poi.longitude,
        seller_id=str(listing.seller_id),
        seller_username=user.username,
        price_eth=str(listing.price_eth),
        price_fiat=f"${float(listing.price_eth) * ETH_USD_RATE:.2f}",
        created_at=listing.created_at.isoformat(),
    )


@router.delete("/marketplace/listing/{listing_id}")
async def cancel_listing(
    listing_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an active POI listing."""
    try:
        listing_uuid = uuid_mod.UUID(listing_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Listing not found")

    result = await db.execute(
        select(POIListing).where(POIListing.id == listing_uuid, POIListing.seller_id == user.id)
    )
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status != "active":
        raise HTTPException(status_code=400, detail="Listing is not active")

    listing.status = "cancelled"
    await db.commit()
    return {"detail": "Listing cancelled"}


@router.post("/marketplace/buy/{listing_id}")
async def buy_poi(
    listing_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Purchase a listed POI. Transfers ownership off-chain."""
    try:
        listing_uuid = uuid_mod.UUID(listing_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Listing not found")

    result = await db.execute(
        select(POIListing, POI)
        .join(POI, POI.id == POIListing.poi_id)
        .where(POIListing.id == listing_uuid)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing, poi = row

    if listing.status != "active":
        raise HTTPException(status_code=400, detail="Listing is not active")
    if str(listing.seller_id) == str(user.id):
        raise HTTPException(status_code=400, detail="Cannot buy your own listing")

    price_eth = Decimal(str(listing.price_eth))
    platform_fee = price_eth * MARKETPLACE_FEE_PCT
    seller_proceeds = price_eth - platform_fee

    # Transfer POI ownership
    poi.owner_id = user.id
    listing.status = "sold"
    listing.buyer_id = user.id
    listing.sold_at = datetime.utcnow()

    # Transfer pending rewards to new owner
    await db.execute(
        POIReward.__table__.update()
        .where(and_(POIReward.poi_id == poi.id, POIReward.claimed == False))
        .values(owner_id=user.id)
    )

    await db.commit()
    return {
        "poi_id": str(poi.id),
        "new_owner": str(user.id),
        "price_eth": str(price_eth),
        "platform_fee_eth": str(platform_fee),
        "seller_proceeds_eth": str(seller_proceeds),
    }


# ── Internal: record a check-in reward (called from pois router) ──

async def record_checkin_reward(db: AsyncSession, poi_id, owner_id, visitor_id, checkin_id):
    """Append a POIReward entry when a check-in occurs. Silently no-ops if poi/owner mismatch."""
    try:
        reward = POIReward(
            poi_id=poi_id,
            owner_id=owner_id,
            visitor_id=visitor_id,
            checkin_id=checkin_id,
            reward_amount_eth=CHECKIN_REWARD_ETH,
        )
        db.add(reward)
        await db.flush()
    except Exception as exc:
        logger.warning("Failed to record POI reward for poi=%s: %s", poi_id, exc)
