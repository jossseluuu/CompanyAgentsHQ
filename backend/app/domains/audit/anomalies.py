"""Reglas deterministas del Auditor (sección 11.3)."""

import json
import re
import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.domains.audit import service

FIGURE = re.compile(r"\d[\d.,]*\s*(?:€|%|euros?|EUR)")
SPEND_FACTOR = 3
LOOP_REPEATS = 3
DENIED_LIMIT = 3
REJECTION_LIMIT = 3


async def check_spend(db: AsyncSession, company_id: uuid.UUID, agent: Any) -> None:
    now = utcnow()
    last_hour = await service.spend(db, company_id, agent_id=agent.id, since=now - timedelta(hours=1))
    week = await service.spend(
        db, company_id, agent_id=agent.id, since=now - timedelta(days=7), until=now - timedelta(hours=1)
    )
    hourly = week / Decimal(167)
    if hourly > 0 and last_hour > hourly * SPEND_FACTOR:
        await service.raise_anomaly(
            db, company_id, agent.id, "gasto_inusual", "warning", {"last_hour": last_hour, "average": hourly}
        )


async def check_loop(db: AsyncSession, company_id: uuid.UUID, agent: Any, task_id: uuid.UUID) -> bool:
    """La misma herramienta con los mismos argumentos tres veces seguidas pausa al agente."""
    traces = await service.task_traces(db, task_id)
    calls = [json.dumps(c, sort_keys=True) for t in traces if t.agent_id == agent.id
             for c in [{"n": x["name"], "i": x["input"]} for x in t.tool_calls]]  # fmt: skip
    tail = calls[-LOOP_REPEATS:]
    if len(tail) == LOOP_REPEATS and len(set(tail)) == 1:
        await service.raise_anomaly(db, company_id, agent.id, "bucle", "high", {"task_id": task_id, "call": tail[0]})
        return True
    return False


async def check_denied(db: AsyncSession, company_id: uuid.UUID, agent: Any, task_id: uuid.UUID) -> None:
    if await service.count_events(db, company_id, "tool.denied", task_id) >= DENIED_LIMIT:
        await service.raise_anomaly(db, company_id, agent.id, "permisos", "warning", {"task_id": task_id})


async def check_citations(
    db: AsyncSession, company_id: uuid.UUID, agent: Any, answer: str, had_sources: bool, source_id: Any
) -> None:
    if FIGURE.search(answer) and not re.search(r"\[\d+\]", answer):
        await service.raise_anomaly(
            db, company_id, agent.id, "sin_citas", "low", {"source": source_id, "had_sources": had_sources}
        )


async def check_rejections(db: AsyncSession, company_id: uuid.UUID, agent: Any) -> None:
    if await service.count_recent(db, company_id, "task.rejected", str(agent.id)) >= REJECTION_LIMIT:
        await service.raise_anomaly(db, company_id, agent.id, "rechazos", "warning", {})


async def check_integrity(db: AsyncSession, company_id: uuid.UUID) -> None:
    result = await service.verify(db, company_id)
    if not result["valid"]:
        await service.raise_anomaly(db, company_id, None, "integridad", "critical", result)
