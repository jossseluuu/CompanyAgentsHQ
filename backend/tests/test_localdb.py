import subprocess
from pathlib import Path
from typing import Any

import pytest

from scripts import localdb


@pytest.mark.parametrize("failure", [subprocess.TimeoutExpired("pg_ctl", 10), AssertionError()])
def test_start_retries_without_reusing_the_failed_instance(
    failure: Exception, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    instances: dict[Path, str] = {}
    ready = object()

    def get_server(data: Path, cleanup_mode: Any = None) -> Any:
        if data in instances:
            return instances[data]  # lo que hace pgserver: devuelve la instancia guardada, aunque falle
        if not get_server.failed:  # type: ignore[attr-defined]
            get_server.failed = True  # type: ignore[attr-defined]
            instances[data] = "rota"
            raise failure
        return ready

    get_server.failed = False  # type: ignore[attr-defined]
    monkeypatch.setattr(localdb.pgserver, "get_server", get_server)
    monkeypatch.setattr(localdb.PostgresServer, "_instances", instances)
    monkeypatch.setattr(localdb, "RETRY_SECONDS", 0)
    monkeypatch.setattr(localdb, "_kill_orphans", lambda: None)

    assert localdb.start(tmp_path / "pgdata") is ready
