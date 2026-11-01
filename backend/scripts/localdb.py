"""PostgreSQL embebido, tolerante a la recuperación tras un apagado sucio."""

import subprocess
import time
from pathlib import Path
from typing import Any

import pgserver
import psutil
from pgserver.postgres_server import PostgresServer

RECOVERY_SECONDS = 90
RETRY_SECONDS = 5


def _kill_orphans() -> None:
    """Un auxiliar cuyo postmaster murió retiene el fichero de log en Windows y ningún arranque progresa."""
    for process in psutil.process_iter(["name", "cmdline", "ppid"]):
        info = process.info
        forked = any(arg.startswith("--fork") for arg in info["cmdline"] or [])  # solo hijos: nunca el postmaster
        if info["name"] == "postgres.exe" and forked and not psutil.pid_exists(info["ppid"]):
            process.kill()


def start(data: Path) -> Any:
    """En Windows la recuperación tarda más de 30 s por su propio fichero de log; pgserver se rinde a los 10."""
    data.parent.mkdir(exist_ok=True)
    deadline = time.monotonic() + RECOVERY_SECONDS
    while True:
        try:
            return pgserver.get_server(data, cleanup_mode=None)
        except (subprocess.TimeoutExpired, AssertionError):  # AssertionError: arrancado, pero aún no «ready»
            if time.monotonic() > deadline:
                raise
            _kill_orphans()
            PostgresServer._instances.clear()  # guarda la instancia fallida y el reintento la devolvería sin datos
            print("PostgreSQL se está recuperando de un apagado sucio; espero…", flush=True)
            time.sleep(RETRY_SECONDS)
