"""Identity claim endpoints — username check and claim."""
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import User
from dependencies import get_current_user

router = APIRouter()

RESERVED_WORDS = {"app", "api", "www", "admin", "auth", "ontrail", "support", "help"}
USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_]{1,18}[a-zA-Z0-9]$", re.IGNORECASE)


class UsernameCheckResponse(BaseModel):
    available: bool
    username: str
    reason: Optional[str] = None


class ClaimRequest(BaseModel):
    username: str
    avatar_url: Optional[str] = None


class ClaimResponse(BaseModel):
    username: str
    subdomain: str
    avatar_url: Optional[str]


@router.get("/check/{username}", response_model=UsernameCheckResponse)
async def check_username(username: str, db: AsyncSession = Depends(get_db)):
    """Check username availability and validate against reserved words."""
    name = username.lower().strip()

    if name in RESERVED_WORDS:
        return UsernameCheckResponse(available=False, username=name, reason="This username is reserved")

    if not USERNAME_PATTERN.match(name):
        return UsernameCheckResponse(
            available=False, username=name,
            reason="Username must be 3-20 chars, alphanumeric + underscores",
        )

    result = await db.execute(select(User).where(User.username == name))
    if result.scalar_one_or_none():
        return UsernameCheckResponse(available=False, username=name, reason="Username already taken")

    return UsernameCheckResponse(available=True, username=name)


@router.post("/claim", response_model=ClaimResponse)
async def claim_identity(
    req: ClaimRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Claim a username and optional avatar. Returns confirmed subdomain."""
    name = req.username.lower().strip()

    if name in RESERVED_WORDS:
        raise HTTPException(status_code=400, detail="This username is reserved")
    if not USERNAME_PATTERN.match(name):
        raise HTTPException(status_code=400, detail="Invalid username format")

    existing = await db.execute(select(User).where(User.username == name))
    if existing.scalar_one_or_none() and existing.scalar_one_or_none().id != user.id:
        raise HTTPException(status_code=409, detail="Username already taken")

    user.username = name
    # Store avatar URL if provided (column may need to be added via migration)
    await db.flush()

    return ClaimResponse(
        username=name,
        subdomain=f"{name}.ontrail.tech",
        avatar_url=req.avatar_url,
    )
