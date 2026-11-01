"""Cadena de hashes del registro de auditoría (RF-AUD-04, RNF-TRA-03)."""

import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

GENESIS = "0" * 64


def compute_hash(
    prev_hash: str, actor: str, event_type: str, target: str, data: dict[str, Any], cost: Decimal, ts: datetime
) -> str:
    payload = json.dumps(
        {
            "prev": prev_hash,
            "actor": actor,
            "type": event_type,
            "target": target,
            "data": data,
            "cost": f"{Decimal(cost):.6f}",
            "ts": ts.astimezone(UTC).isoformat(timespec="milliseconds"),
        },
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()
