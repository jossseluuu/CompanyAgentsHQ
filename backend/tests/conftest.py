import os
import subprocess
import sys
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from scripts.localdb import start

BACKEND = Path(__file__).resolve().parents[1]
_server = start(BACKEND / ".local" / "pgdata")
_port = _server.get_uri().rsplit(":", 1)[1].split("/")[0]
os.environ.update(
    APP_ENV="test",
    DATABASE_URL=f"postgresql+asyncpg://postgres:@127.0.0.1:{_port}/cahq_test",
    QUEUE_BACKEND="inline",
    BUS_BACKEND="memory",
    STORAGE_BACKEND="local",
    STORAGE_DIR=tempfile.mkdtemp(prefix="cahq-test-"),
    LLM_PROVIDER="fake",
    EMBEDDINGS_PROVIDER="hash",
    OLLAMA_URL="http://127.0.0.1:9",  # las pruebas no deben depender de un Ollama en marcha
    WALK_SECONDS_PER_TILE="0",
    LOG_LEVEL="WARNING",
)

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.db import Base, dispose_engine, get_engine  # noqa: E402
from app.core.events import bus  # noqa: E402
from app.domains.runtime import queue  # noqa: E402
from app.domains.runtime import service as runtime_service  # noqa: E402
from app.domains.runtime.llm.router import fake  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated() -> None:
    _server.psql("drop database if exists cahq_test with (force);")
    _server.psql("create database cahq_test;")
    env = {**os.environ}
    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"], cwd=BACKEND, check=True, env=env
    )
    runtime_service.register()


@pytest.fixture(autouse=True)
async def clean() -> AsyncIterator[None]:
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    async with get_engine().begin() as conn:
        await conn.execute(text("set session_replication_role = replica"))
        await conn.execute(text(f"truncate {tables} cascade"))
        await conn.execute(text("set session_replication_role = origin"))
    fake.forced.clear()
    fake.requests.clear()
    yield
    await settle()
    await dispose_engine()


async def settle() -> None:
    """Espera a que terminen la cola y los manejadores, incluidos los que encolan más trabajo."""
    while queue._running or bus._background:
        await queue.drain()
        await bus.drain()


class Api:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def request(self, method: str, url: str, expected: int | None = None, **kwargs: object) -> httpx.Response:
        response = await self.client.request(method, f"/api/v1{url}", **kwargs)  # type: ignore[arg-type]
        if expected is not None:
            assert response.status_code == expected, response.text
        return response

    async def get(self, url: str, **kwargs: object) -> object:
        return (await self.request("GET", url, 200, **kwargs)).json()

    async def post(self, url: str, json: object = None, expected: int | None = None) -> object:
        response = await self.request("POST", url, json=json)
        assert response.status_code < 300 if expected is None else response.status_code == expected, response.text
        return response.json() if response.content else None

    async def patch(self, url: str, json: object) -> object:
        return (await self.request("PATCH", url, 200, json=json)).json()


@pytest.fixture
async def guest() -> AsyncIterator[Api]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield Api(client)


@pytest.fixture
async def owner(guest: Api) -> Api:
    response = await guest.request(
        "POST", "/auth/setup", 201, json={"email": "duena@example.com", "password": "contraseña-1", "name": "Dueña"}
    )
    guest.client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    return guest


@pytest.fixture
async def api(owner: Api) -> Api:
    await owner.post("/company", {"name": "Acme", "mission": "Vender más", "template": "default"})
    return owner


async def agent_id(api: Api, role: str) -> str:
    agents = await api.get("/agents")
    return next(a["id"] for a in agents if a["role"] == role)  # type: ignore[union-attr,index]


async def room_id(api: Api, slug: str) -> str:
    office = await api.get("/office")
    return next(r["id"] for r in office["rooms"] if r["slug"] == slug)  # type: ignore[index]
