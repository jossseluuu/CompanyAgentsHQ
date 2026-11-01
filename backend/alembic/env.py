import asyncio
import importlib
import pkgutil

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

import app.core.models  # noqa: F401
import app.domains
from app.core.config import get_settings
from app.core.db import Base

for info in pkgutil.iter_modules(app.domains.__path__):
    try:
        importlib.import_module(f"app.domains.{info.name}.models")
    except ModuleNotFoundError:
        pass

target_metadata = Base.metadata


def run(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def main() -> None:
    engine = create_async_engine(get_settings().database_url)
    async with engine.begin() as conn:
        await conn.run_sync(run)
    await engine.dispose()


asyncio.run(main())
