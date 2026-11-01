import json
from typing import Any

import pytest
from moto import mock_aws
from sqlalchemy import func, select

from app.core.auth import Owner
from app.core.config import get_settings
from app.core.db import session_scope
from app.domains.files.storage import LocalStorage, S3Storage
from app.domains.runtime.queue import JOBS
from app.main import app
from app.worker import WorkerSettings


async def test_write_is_committed_before_the_response_is_sent() -> None:
    """Un cliente real lee nada más recibir la respuesta: ASGITransport no lo notaría porque espera al final."""
    seen: list[int] = []
    body = json.dumps({"email": "duena@example.com", "password": "contraseña-1", "name": "Dueña"}).encode()
    received = [{"type": "http.request", "body": body, "more_body": False}]

    async def receive() -> dict[str, Any]:
        return received.pop() if received else {"type": "http.disconnect"}

    async def send(message: dict[str, Any]) -> None:
        if message["type"] == "http.response.start":
            async with session_scope() as db:
                seen.append((await db.execute(select(func.count()).select_from(Owner))).scalar_one())

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST", "scheme": "http",
        "path": "/api/v1/auth/setup", "raw_path": b"/api/v1/auth/setup", "query_string": b"", "root_path": "",
        "headers": [(b"content-type", b"application/json")], "client": ("127.0.0.1", 1), "server": ("test", 80),
    }  # fmt: skip
    await app(scope, receive, send)
    assert seen == [1]


async def test_s3_storage_round_trip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    settings = get_settings()
    monkeypatch.setattr(settings, "s3_endpoint", "")
    monkeypatch.setattr(settings, "s3_access_key", "a")
    monkeypatch.setattr(settings, "s3_secret_key", "b")
    with mock_aws():
        storage = S3Storage()
        await storage.put("empresa/sala/a.txt", b"hola", "text/plain")
        assert await storage.get("empresa/sala/a.txt") == b"hola"


async def test_local_storage_blocks_path_escape(tmp_path) -> None:  # type: ignore[no-untyped-def]
    storage = LocalStorage(tmp_path)
    await storage.put("a/b.txt", b"x", "text/plain")
    assert await storage.get("a/b.txt") == b"x"
    with pytest.raises(ValueError):
        await storage.put("../fuera.txt", b"x", "text/plain")


def test_worker_exposes_every_job() -> None:
    assert {f.__name__ for f in WorkerSettings.functions} == set(JOBS)
    assert {"run_task", "review_task", "plan_goal", "chat_reply", "index_document"} <= set(JOBS)
