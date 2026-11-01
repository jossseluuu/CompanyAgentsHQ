import json
import logging
import sys
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import inspect


def row(obj: Any, *exclude: str) -> dict[str, Any]:
    """Serializa una fila del ORM a un dict listo para JSON."""
    out: dict[str, Any] = {}
    for column in inspect(obj).mapper.column_attrs:
        if column.key in exclude:
            continue
        value = getattr(obj, column.key)
        if isinstance(value, Decimal):
            value = float(value)
        out[column.key] = value
    return out


def rows(items: Any, *exclude: str) -> list[dict[str, Any]]:
    return [row(item, *exclude) for item in items]


def as_uuid(value: Any) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


class JsonFormatter(logging.Formatter):
    """Registros estructurados (RNF-MAN-08)."""

    def format(self, record: logging.LogRecord) -> str:
        data: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in ("request_id", "path", "status", "ms", "event"):
            if hasattr(record, key):
                data[key] = getattr(record, key)
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(data, ensure_ascii=False)


def setup_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=level, handlers=[handler], force=True)
