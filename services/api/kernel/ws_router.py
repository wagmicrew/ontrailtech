"""
Kernel WebSocket endpoint: /ws/kernel

Clients connect with ?token=<jwt>.
On connect: sends kernel:hello with app list.
On message: routes client events to the event bus.
"""
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError
from sqlalchemy import select

from config import get_settings
from database import AsyncSessionLocal
from models import User, UserRole, ACLRole
from kernel.core.event_bus import event_bus
from kernel.core.app_registry import list_all as list_apps

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


async def _auth_ws(token: str):
    """Decode JWT token and return User if admin, else raise."""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if not user_id:
            return None
    except JWTError:
        return None

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return None
        # Check admin role
        role_result = await db.execute(
            select(ACLRole.role_name)
            .select_from(UserRole)
            .join(ACLRole, UserRole.role_id == ACLRole.id)
            .where(UserRole.user_id == user.id, ACLRole.role_name.in_(["admin", "ancient_owner"]))
            .limit(1)
        )
        if role_result.first() is None:
            return None
        return user


@router.websocket("/ws/kernel")
async def kernel_ws(ws: WebSocket, token: str = Query(...)):
    user = await _auth_ws(token)
    if user is None:
        await ws.accept()
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws.accept()
    event_bus.add_ws_client(ws)
    logger.info("Kernel WS connected: user=%s", user.id)

    # Send handshake
    await ws.send_text(json.dumps({
        "event": "kernel:hello",
        "payload": {
            "version": "1.0.0",
            "user_id": str(user.id),
            "apps": [{"id": a.id, "name": a.name, "icon": a.icon} for a in list_apps()],
        },
    }))

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                event = msg.get("event", "")
                payload = msg.get("payload", None)
                await event_bus.emit(event, payload)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        event_bus.remove_ws_client(ws)
        logger.info("Kernel WS disconnected: user=%s", user.id)
