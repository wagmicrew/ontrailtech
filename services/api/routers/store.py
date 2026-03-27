from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import Step, StoreItem, StorePurchase, User

router = APIRouter()


class PurchaseRequest(BaseModel):
    item_slug: str
    fulfillment_wallet: Optional[str] = None


async def get_step_balance(db: AsyncSession, user_id) -> int:
    total_steps = await db.scalar(
        select(func.coalesce(func.sum(Step.step_count), 0)).where(Step.user_id == user_id)
    ) or 0
    spent_steps = await db.scalar(
        select(func.coalesce(func.sum(StorePurchase.step_cost), 0)).where(
            StorePurchase.user_id == user_id,
            StorePurchase.status != "cancelled",
        )
    ) or 0
    return max(int(total_steps) - int(spent_steps), 0)


@router.get("/catalog")
async def get_catalog(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items_result = await db.execute(
        select(StoreItem).where(StoreItem.is_active == True).order_by(StoreItem.category, StoreItem.step_cost)  # noqa: E712
    )
    items = items_result.scalars().all()

    purchases_result = await db.execute(
        select(StorePurchase, StoreItem)
        .join(StoreItem, StoreItem.id == StorePurchase.store_item_id)
        .where(StorePurchase.user_id == user.id)
        .order_by(StorePurchase.created_at.desc())
        .limit(20)
    )

    balance = await get_step_balance(db, user.id)

    return {
        "step_balance": balance,
        "items": [
            {
                "id": str(item.id),
                "slug": item.slug,
                "name": item.name,
                "description": item.description,
                "category": item.category,
                "item_type": item.item_type,
                "step_cost": item.step_cost,
                "fulfillment_type": item.fulfillment_type,
                "metadata": item.item_metadata or {},
            }
            for item in items
        ],
        "purchases": [
            {
                "id": str(purchase.id),
                "item_slug": item.slug,
                "item_name": item.name,
                "step_cost": purchase.step_cost,
                "status": purchase.status,
                "fulfillment_wallet": purchase.fulfillment_wallet,
                "metadata": purchase.purchase_metadata or {},
                "created_at": purchase.created_at.isoformat(),
            }
            for purchase, item in purchases_result.all()
        ],
    }


@router.post("/purchase")
async def purchase_item(
    req: PurchaseRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item_result = await db.execute(
        select(StoreItem).where(StoreItem.slug == req.item_slug, StoreItem.is_active == True)  # noqa: E712
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Store item not found")

    balance = await get_step_balance(db, user.id)
    if balance < item.step_cost:
        raise HTTPException(status_code=400, detail="Not enough steps for this purchase")

    metadata = dict(item.item_metadata or {})
    status = "completed"
    fulfillment_wallet = req.fulfillment_wallet or user.preferred_reward_wallet or user.wallet_address

    if item.fulfillment_type == "wallet_required":
        if not fulfillment_wallet:
            raise HTTPException(status_code=400, detail="A wallet is required for this item")
        status = "pending_fulfillment"

    if item.item_type == "profile_image_upload":
        user.profile_image_upload_credits += int(metadata.get("grants", {}).get("profile_image_upload_credits", 1))
    elif item.item_type == "header_image_upload":
        user.header_image_upload_credits += int(metadata.get("grants", {}).get("header_image_upload_credits", 1))
    elif item.item_type == "ai_avatar":
        user.ai_avatar_credits += int(metadata.get("grants", {}).get("ai_avatar_credits", 1))
        status = "pending_fulfillment"
    elif item.item_type == "premium_visibility":
        duration_hours = int(metadata.get("duration_hours", 24))
        base_time = user.profile_visibility_boost_until or datetime.utcnow()
        if base_time < datetime.utcnow():
            base_time = datetime.utcnow()
        user.profile_visibility_boost_until = base_time + timedelta(hours=duration_hours)

    purchase = StorePurchase(
        user_id=user.id,
        store_item_id=item.id,
        step_cost=item.step_cost,
        status=status,
        fulfillment_wallet=fulfillment_wallet,
        purchase_metadata={
            "item_type": item.item_type,
            **metadata,
        },
    )
    db.add(purchase)
    await db.flush()

    return {
        "purchase_id": str(purchase.id),
        "status": purchase.status,
        "remaining_step_balance": await get_step_balance(db, user.id),
        "profile_visibility_boost_until": user.profile_visibility_boost_until.isoformat() if user.profile_visibility_boost_until else None,
        "profile_image_upload_credits": user.profile_image_upload_credits,
        "header_image_upload_credits": user.header_image_upload_credits,
        "ai_avatar_credits": user.ai_avatar_credits,
    }
