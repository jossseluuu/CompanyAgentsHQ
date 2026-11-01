"""PostgreSQL embebido, tolerante a la recuperación tras un apagado sucio."""

import subprocess
import time
from pathlib import Path
from typing import Any

import pgserver

RECOVERY_SECONDS = 90
RETRY_SECONDS = 5


def start(data: Path) -> Any:
    """En Windows la recuperación tarda más de 30 s por su propio fichero de log; pgserver se rinde a los 10."""
    data.parent.mkdir(exist_ok=True)
    deadline = time.monotonic() + RECOVERY_SECONDS
    while True:
        try:
            return pgserver.get_server(data, cleanup_mode=None)
        except subprocess.TimeoutExpired:
            if time.monotonic() > deadline:
                raise
            print("PostgreSQL se está recuperando de un apagado sucio; espero…", flush=True)
            time.sleep(RETRY_SECONDS)
