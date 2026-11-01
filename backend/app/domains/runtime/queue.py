"""Cola de trabajos: arq sobre Redis, o en proceso si no hay Redis."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import db as db_module
from app.core.config import get_settings

log = logging.getLogger(__name__)
DEADLOCK_RETRIES = 3
JOBS: dict[str, Callable[..., Awaitable[None]]] = {}
_pool: Any = None
_running: set[asyncio.Task[None]] = set()
_limit = asyncio.Semaphore(4)


def job(func: Callable[..., Awaitable[None]]) -> Callable[..., Awaitable[None]]:
    JOBS[func.__name__] = func
    return func


async def run_job(name: str, *args: Any) -> None:
    """Cada paso del trabajo es atómico: si PostgreSQL detecta un interbloqueo, se repite."""
    for attempt in range(DEADLOCK_RETRIES):
        try:
            await JOBS[name](*args)
            return
        except DBAPIError as exc:
            if "deadlock" not in str(exc) or attempt == DEADLOCK_RETRIES - 1:
                raise
            await asyncio.sleep(0.1 * (attempt + 1))


async def _inline(name: str, args: tuple[Any, ...]) -> None:
    async with _limit:
        try:
            await run_job(name, *args)
        except Exception:
            log.exception("job_failed", extra={"event": name})


async def _submit(name: str, args: tuple[Any, ...]) -> None:
    global _pool
    if get_settings().queue_backend == "arq":
        from arq import create_pool
        from arq.connections import RedisSettings

        if _pool is None:
            _pool = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
        await _pool.enqueue_job(name, *args)
        return
    task = asyncio.ensure_future(_inline(name, args))
    _running.add(task)
    task.add_done_callback(_running.discard)


def enqueue(db: AsyncSession, name: str, *args: Any) -> None:
    """El trabajo sale tras el commit: nunca arranca antes de que sus datos sean visibles."""
    db.info.setdefault("jobs", []).append((name, tuple(str(a) for a in args)))


async def flush(jobs: list[tuple[str, tuple[Any, ...]]]) -> None:
    for name, args in jobs:
        await _submit(name, args)


db_module.job_flusher = flush


async def drain() -> None:
    """Espera a que la cola en proceso se vacíe; lo usan los tests y la demo."""
    while _running:
        await asyncio.gather(*list(_running), return_exceptions=True)
