from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import User
from dependencies import get_current_user

router = APIRouter()


class UserProfile(BaseModel):
    id: str
    username: str
    wallet_address: str
    reputation_score: float

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None


@router.get("/{user_id}", response_model=UserProfile)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(
        id=str(user.id),
        username=user.username,
        wallet_address=user.wallet_address,
        reputation_score=user.reputation_score or 0.0,
    )


@router.get("/runner/{username}", response_model=UserProfile)
async def get_runner_profile(username: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Runner not found")
    return UserProfile(
        id=str(user.id),
        username=user.username,
        wallet_address=user.wallet_address,
        reputation_score=user.reputation_score or 0.0,
    )
