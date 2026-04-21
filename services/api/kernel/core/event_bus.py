import asyncio
import logging
from typing import Any, Callable, Dict, List

logger = logging.getLogger(__name__)

Handler = Callable[[Any], None]

class EventBus:
    def __init__(self) -> None:
        self._listeners: Dict[str, List[Handler]] = {}
        self._ws_clients: List[Any] = []  # WebSocket connections

    def subscribe(self, event: str, handler: Handler) -> None:
        self._listeners.setdefault(event, []).append(handler)

    def unsubscribe(self, event: str, handler: Handler) -> None:
        handlers = self._listeners.get(event, [])
        if handler in handlers:
            handlers.remove(handler)

    async def emit(self, event: str, payload: Any = None) -> None:
        for handler in self._listeners.get(event, []):
            try:
                result = handler(payload)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                logger.exception("EventBus handler error for event '%s'", event)

        # Broadcast to all connected WebSocket clients
        import json
        msg = json.dumps({"event": event, "payload": payload})
        dead = []
        for ws in self._ws_clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._ws_clients.discard(ws) if hasattr(self._ws_clients, 'discard') else (self._ws_clients.remove(ws) if ws in self._ws_clients else None)

    def add_ws_client(self, ws: Any) -> None:
        if ws not in self._ws_clients:
            self._ws_clients.append(ws)

    def remove_ws_client(self, ws: Any) -> None:
        if ws in self._ws_clients:
            self._ws_clients.remove(ws)


# Singleton
event_bus = EventBus()
