import pytest
from moto import mock_aws

from app.core.config import get_settings
from app.domains.files.storage import LocalStorage, S3Storage
from app.domains.runtime.queue import JOBS
from app.worker import WorkerSettings


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
