import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import get_settings


def utcnow() -> datetime:
    """UTC con precisión de milisegundos (RNF-TRA-06)."""
    now = datetime.now(UTC)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


class Base(DeclarativeBase):
    pass


class Entity(Base):
    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


job_flusher: Callable[[list[Any]], Awaitable[None]] | None = None
before_commit: list[Callable[[AsyncSession], Awaitable[None]]] = []
_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        _engine = create_async_engine(get_settings().database_url, pool_size=10, max_overflow=20)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None


def _maker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


async def commit(db: AsyncSession) -> None:
    """Confirma la transacción y solo entonces difunde los eventos que acumuló."""
    from app.core import events

    for hook in before_commit:
        await hook(db)
    pending: list[Any] = db.info.pop("events", [])
    jobs: list[Any] = db.info.pop("jobs", [])
    await db.commit()
    await events.bus.dispatch(pending)
    if jobs and job_flusher is not None:
        await job_flusher(jobs)


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    async with _maker()() as db:
        try:
            yield db
            await commit(db)
        except BaseException:
            db.info.pop("events", None)
            db.info.pop("jobs", None)
            db.info.pop("audit", None)
            await db.rollback()
            raise


async def get_db() -> AsyncIterator[AsyncSession]:
    async with session_scope() as db:
        yield db


# scope="function": el commit ocurre antes de responder; si no, un cliente rápido no ve lo que acaba de escribir.
Db = Annotated[AsyncSession, Depends(get_db, scope="function")]
