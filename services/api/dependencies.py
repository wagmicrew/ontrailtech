from fastapi import Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError

from database import get_db
from config import get_settings
from models import User, UserRole, ACLRole

settings = get_settings()


async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(
        select(UserRole)
        .join(ACLRole, UserRole.role_id == ACLRole.id)
        .where(UserRole.user_id == user.id, ACLRole.role_name == "admin")
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_ancient_owner(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Require AncientOwner role — full platform control."""
    result = await db.execute(
        select(UserRole)
        .join(ACLRole, UserRole.role_id == ACLRole.id)
        .where(UserRole.user_id == user.id, ACLRole.role_name == "ancient_owner")
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="AncientOwner access required")
    return user


async def get_user_roles(user_id, db: AsyncSession) -> list[str]:
    """Get all role names for a user."""
    result = await db.execute(
        select(ACLRole.role_name)
        .join(UserRole, UserRole.role_id == ACLRole.id)
        .where(UserRole.user_id == user_id)
    )
    return [r[0] for r in result.all()]
