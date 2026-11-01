"""PostgreSQL + pgvector embebido para desarrollar sin Docker (pgserver)."""

import sys
import time
from pathlib import Path

import pgserver

data = Path(__file__).resolve().parents[1] / ".local" / "pgdata"
data.parent.mkdir(exist_ok=True)
server = pgserver.get_server(data, cleanup_mode=None)
names = [a for a in sys.argv[1:] if not a.startswith("--")] or ["companyagentshq"]
for name in names:
    if name not in server.psql("select datname from pg_database;"):
        server.psql(f"create database {name};")
print(server.get_uri())
if "--wait" in sys.argv:
    while True:
        time.sleep(3600)
