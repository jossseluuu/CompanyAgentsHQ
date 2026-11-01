import json
import logging
import re
import sys
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import inspect

_MARK = r"(?:(?:n|fragmento|fuente)\s*[=:]?\s*)?\d+"
_CITATION = re.compile(rf"\[\s*{_MARK}(?:\s*[,;]\s*{_MARK})*\s*\](?!\()", re.IGNORECASE)


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


def normalize_citations(text: str) -> str:
    """Los modelos pequeños escriben [n=1], [fragmento 1] o [1, 2]: todo queda como [1][2]."""

    def rewrite(match: re.Match[str]) -> str:
        return "".join(f"[{number}]" for number in re.findall(r"\d+", match.group()))

    return _CITATION.sub(rewrite, text)


def drop_unsupported_citations(text: str, valid: set[int]) -> str:
    """Un modelo local cita [1] aunque no haya fuentes: lo que no se puede comprobar no se muestra."""
    kept = re.sub(r" ?\[(\d+)\]", lambda m: m.group() if int(m.group(1)) in valid else "", text)
    if not valid:
        kept = re.sub(r"\n+[*#_ ]*(Referencias|Fuentes|References|Sources)\b.*\Z", "", kept, flags=re.S | re.I)
    return kept.rstrip()


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
