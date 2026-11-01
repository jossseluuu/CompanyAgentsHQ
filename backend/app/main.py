import asyncio
import importlib
import logging
import pkgutil
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import domains
from app.core import auth, errors
from app.core.config import get_settings
from app.core.db import dispose_engine, session_scope
from app.core.events import bus
from app.core.util import setup_logging
from app.domains.runtime import service as runtime_service

log = logging.getLogger("app.request")


async def _ticker(seconds: int) -> None:
    while True:
        await asyncio.sleep(seconds)
        try:
            await runtime_service.tick_all()
        except Exception:
            log.exception("tick_failed")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    setup_logging(settings.log_level)
    runtime_service.register()
    background = []
    if settings.bus_backend == "redis":
        background.append(asyncio.create_task(bus.relay_forever()))
    if settings.queue_backend == "inline" and settings.app_env != "test":
        await runtime_service.recover(lease_seconds=0)
        background.append(asyncio.create_task(_ticker(settings.tick_seconds)))
    yield
    for task in background:
        task.cancel()
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="CompanyAgentsHQ",
        version="1.0.0",
        description="API de una empresa de agentes de IA gestionada desde una oficina isométrica.",
        lifespan=lifespan,
    )
    errors.install(app)
    app.add_middleware(
        CORSMiddleware, allow_origins=[settings.cors_origin], allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )  # fmt: skip

    @app.middleware("http")
    async def request_log(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = uuid.uuid4().hex[:12]
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        log.info("request", extra={
            "request_id": request_id, "path": request.url.path, "status": response.status_code,
            "ms": round((time.perf_counter() - started) * 1000, 1),
        })  # fmt: skip
        return response

    api = APIRouter(prefix="/api/v1")
    api.include_router(auth.router)
    for info in pkgutil.iter_modules(domains.__path__):
        try:
            module = importlib.import_module(f"app.domains.{info.name}.router")
        except ModuleNotFoundError:
            continue
        (app if info.name == "realtime" else api).include_router(module.router)
    app.include_router(api)

    @app.get("/health", tags=["ops"])
    async def health() -> dict[str, str]:
        async with session_scope() as db:
            await db.execute(text("select 1"))
        return {"status": "ok"}

    return app


app = create_app()
