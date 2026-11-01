"""Worker de arq: N procesos consumen la misma cola de Redis (RNF-ESC-05)."""

import logging
from typing import Any

from arq import cron
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.core.db import dispose_engine
from app.core.util import setup_logging
from app.domains.runtime import service as runtime_service
from app.domains.runtime.queue import JOBS

log = logging.getLogger(__name__)


def _wrap(name: str) -> Any:
    async def run(_: dict[str, Any], *args: str) -> None:
        await JOBS[name](*args)

    run.__name__ = name
    run.__qualname__ = name
    return run


async def startup(_: dict[str, Any]) -> None:
    setup_logging(get_settings().log_level)
    runtime_service.register()
    await runtime_service.recover()


async def shutdown(_: dict[str, Any]) -> None:
    await dispose_engine()


async def tick(_: dict[str, Any]) -> None:
    await runtime_service.tick_all()


class WorkerSettings:
    functions = [_wrap(name) for name in JOBS]
    cron_jobs = [cron(tick, second=set(range(0, 60, 15)), unique=True)]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 8
    job_timeout = 3600
