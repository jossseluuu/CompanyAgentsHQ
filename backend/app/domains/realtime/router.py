"""WebSocket: reenvía el bus al navegador y recupera lo perdido al reconectar (RNF-TRE-03)."""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.auth import SESSION_COOKIE, owner_from_token
from app.core.config import get_settings
from app.core.db import session_scope
from app.core.events import Event, bus
from app.core.models import RealtimeEvent

router = APIRouter()
QUEUE_LIMIT = 2000


def _encode(event: Event) -> str:
    return json.dumps({"type": event.type, "data": event.data, "ts": event.ts, "seq": event.seq})


@router.websocket("/ws")
async def websocket(socket: WebSocket, since: int | None = None) -> None:
    origin = socket.headers.get("origin")
    if origin and origin != get_settings().cors_origin:
        await socket.close(code=4403)
        return
    async with session_scope() as db:
        if await owner_from_token(db, socket.cookies.get(SESSION_COOKIE)) is None:
            await socket.close(code=4401)
            return
    await socket.accept()
    queue: asyncio.Queue[Event] = asyncio.Queue(QUEUE_LIMIT)

    async def listener(event: Event) -> None:
        queue.put_nowait(event)

    bus.listeners.add(listener)
    try:
        if since is not None:
            async with session_scope() as db:
                stmt = select(RealtimeEvent).where(RealtimeEvent.seq > since).order_by(RealtimeEvent.seq).limit(1000)
                for item in (await db.execute(stmt)).scalars():
                    await socket.send_text(
                        _encode(Event(item.type, item.data, item.ts.isoformat(), item.seq))
                    )
        sender = asyncio.create_task(_send_loop(socket, queue))
        try:
            while True:
                await socket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            sender.cancel()
    finally:
        bus.listeners.discard(listener)


async def _send_loop(socket: WebSocket, queue: asyncio.Queue[Event]) -> None:
    while True:
        await socket.send_text(_encode(await queue.get()))
