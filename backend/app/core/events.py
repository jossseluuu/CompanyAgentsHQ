"""Bus de eventos: persiste cada evento, avisa a los módulos del proceso y difunde al navegador."""

import asyncio
import json
import logging
import uuid
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.models import RealtimeEvent

log = logging.getLogger(__name__)
CHANNEL = "companyagentshq:events"
EPHEMERAL = {"agent.message"}  # trozos de streaming: no se guardan para reenvío


@dataclass
class Event:
    type: str
    data: dict[str, Any]
    ts: str
    seq: int = 0


Handler = Callable[[Event], Awaitable[None]]
Listener = Callable[[Event], Awaitable[None]]


def _json(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(type(value))


def clean(data: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = json.loads(json.dumps(data, default=_json))
    return result


class EventBus:
    def __init__(self) -> None:
        self.handlers: dict[str, list[Handler]] = defaultdict(list)
        self.listeners: set[Listener] = set()
        self._background: set[asyncio.Task[None]] = set()
        self._redis: Any = None

    def subscribe(self, event_type: str, handler: Handler) -> None:
        self.handlers[event_type].append(handler)

    def _spawn(self, coro: Awaitable[None]) -> None:
        task = asyncio.ensure_future(coro)
        self._background.add(task)
        task.add_done_callback(self._background.discard)

    async def _redis_client(self) -> Any:
        if self._redis is None:
            import redis.asyncio as aioredis

            self._redis = aioredis.from_url(get_settings().redis_url)
        return self._redis

    async def fan_out(self, event: Event) -> None:
        for listener in list(self.listeners):
            try:
                await listener(event)
            except Exception:
                self.listeners.discard(listener)

    async def dispatch(self, events: list[Event]) -> None:
        for event in events:
            if get_settings().bus_backend == "redis":
                client = await self._redis_client()
                await client.publish(CHANNEL, json.dumps(event.__dict__))
            else:
                await self.fan_out(event)
            for handler in self.handlers.get(event.type, []):
                self._spawn(self._safe(handler, event))

    async def _safe(self, handler: Handler, event: Event) -> None:
        try:
            await handler(event)
        except Exception:
            log.exception("handler_failed", extra={"event": event.type})

    async def relay_forever(self) -> None:
        """Puente Redis → WebSocket para las instancias de la API."""
        client = await self._redis_client()
        pubsub = client.pubsub()
        await pubsub.subscribe(CHANNEL)
        async for message in pubsub.listen():
            if message["type"] == "message":
                await self.fan_out(Event(**json.loads(message["data"])))

    async def drain(self) -> None:
        """Espera a los manejadores en curso; lo usan los tests."""
        while self._background:
            await asyncio.gather(*list(self._background), return_exceptions=True)


bus = EventBus()


async def emit(db: AsyncSession, event_type: str, data: dict[str, Any]) -> Event:
    """Registra un evento en la transacción; se difunde tras el commit."""
    payload = clean(data)
    ts = utcnow()
    seq = 0
    if event_type not in EPHEMERAL:
        row = RealtimeEvent(type=event_type, data=payload, ts=ts)
        db.add(row)
        await db.flush()
        seq = row.seq
    event = Event(type=event_type, data=payload, ts=ts.isoformat(), seq=seq)
    db.info.setdefault("events", []).append(event)
    return event


async def emit_now(event_type: str, data: dict[str, Any]) -> None:
    """Evento efímero sin transacción (texto en streaming)."""
    await bus.dispatch([Event(type=event_type, data=clean(data), ts=utcnow().isoformat())])
