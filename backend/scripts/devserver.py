"""Arranque local sin Docker: PostgreSQL embebido, migraciones y API con cola en proceso."""

import os
import subprocess
import sys
from pathlib import Path

from localdb import start

BACKEND = Path(__file__).resolve().parents[1]
database = os.environ.get("DEV_DATABASE", "companyagentshq")
server = start(BACKEND / ".local" / "pgdata")
if database not in server.psql("select datname from pg_database;"):
    server.psql(f"create database {database};")
port = server.get_uri().rsplit(":", 1)[1].split("/")[0]
env = {
    **os.environ,
    "DATABASE_URL": f"postgresql+asyncpg://postgres:@127.0.0.1:{port}/{database}",
    "QUEUE_BACKEND": "inline",
    "BUS_BACKEND": "memory",
    "STORAGE_BACKEND": "local",
}
subprocess.run([sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"], cwd=BACKEND, env=env, check=True)
subprocess.run(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--port", os.environ.get("PORT", "8000")],
    cwd=BACKEND,
    env=env,
    check=False,
)
