import csv
import io
import json
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, cast, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import db as db_module
from app.core.db import utcnow
from app.core.errors import NotFound
from app.core.events import clean, emit
from app.core.util import row, rows
from app.domains.audit.chain import GENESIS, compute_hash
from app.domains.audit.models import Anomaly, AuditEvent, Notification, Trace


async def record(
    db: AsyncSession,
    company_id: uuid.UUID,
    actor: str,
    event_type: str,
    target: str,
    data: dict[str, Any],
    cost: Decimal = Decimal(0),
) -> None:
    """Guarda el evento en la transacción; se encadena justo antes del commit."""
    db.info.setdefault("audit", []).append((company_id, actor, event_type, target, clean(data), cost, utcnow()))


async def chain_pending(db: AsyncSession) -> None:
    """El candado de la cadena se toma el último, sin pedir ya más bloqueos: así no hay interbloqueos."""
    pending = db.info.pop("audit", [])
    for company_id in dict.fromkeys(item[0] for item in pending):
        await db.execute(text("select pg_advisory_xact_lock(hashtext(:k))"), {"k": f"audit:{company_id}"})
        stmt = select(AuditEvent.hash).where(AuditEvent.company_id == company_id).order_by(AuditEvent.seq.desc()).limit(1)
        prev = (await db.execute(stmt)).scalar_one_or_none() or GENESIS
        for owner, actor, event_type, target, payload, cost, ts in pending:
            if owner != company_id:
                continue
            digest = compute_hash(prev, actor, event_type, target, payload, cost, ts)
            db.add(
                AuditEvent(
                    company_id=company_id, actor=actor, type=event_type, target=target, data=payload, cost_eur=cost,
                    prev_hash=prev, hash=digest, created_at=ts,
                )
            )  # fmt: skip
            await db.flush()
            prev = digest


db_module.before_commit.append(chain_pending)


def _pending(db: AsyncSession) -> list[tuple[Any, ...]]:
    pending: list[tuple[Any, ...]] = db.info.get("audit", [])
    return pending


async def verify(db: AsyncSession, company_id: uuid.UUID) -> dict[str, Any]:
    stmt = select(AuditEvent).where(AuditEvent.company_id == company_id).order_by(AuditEvent.seq)
    prev = GENESIS
    count = 0
    for event in (await db.execute(stmt)).scalars():
        expected = compute_hash(prev, event.actor, event.type, event.target, event.data, event.cost_eur, event.created_at)
        if event.prev_hash != prev or event.hash != expected:
            return {"valid": False, "broken_at_seq": event.seq, "checked": count}
        prev = event.hash
        count += 1
    return {"valid": True, "broken_at_seq": None, "checked": count}


async def list_events(
    db: AsyncSession,
    company_id: uuid.UUID,
    *,
    agent: str | None = None,
    event_type: str | None = None,
    room: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 200,
) -> list[AuditEvent]:
    stmt = select(AuditEvent).where(AuditEvent.company_id == company_id)
    if agent:
        stmt = stmt.where(AuditEvent.actor == agent)
    if event_type:
        stmt = stmt.where(AuditEvent.type.like(f"{event_type}%"))
    if room:
        stmt = stmt.where(AuditEvent.data["room_id"].astext == room)
    if start:
        stmt = stmt.where(AuditEvent.created_at >= start)
    if end:
        stmt = stmt.where(AuditEvent.created_at <= end)
    return list((await db.execute(stmt.order_by(AuditEvent.seq.desc()).limit(limit))).scalars())


def export(events: list[AuditEvent], fmt: str) -> str:
    data = [
        {**row(e), "data": json.dumps(e.data, ensure_ascii=False), "created_at": e.created_at.isoformat()} for e in events
    ]
    if fmt == "json":
        return json.dumps(data, ensure_ascii=False, default=str, indent=1)
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=["seq", "created_at", "actor", "type", "target", "cost_eur", "data", "hash"],
                            extrasaction="ignore")  # fmt: skip
    writer.writeheader()
    writer.writerows(data)
    return out.getvalue()


# Trazas
async def add_trace(db: AsyncSession, **fields: Any) -> Trace:
    trace = Trace(**fields)
    db.add(trace)
    await db.flush()
    return trace


async def task_traces(db: AsyncSession, task_id: uuid.UUID) -> list[Trace]:
    stmt = select(Trace).where(Trace.task_id == task_id).order_by(Trace.created_at, Trace.step)
    return list((await db.execute(stmt)).scalars())


async def agent_traces(db: AsyncSession, agent_id: uuid.UUID, limit: int = 30) -> list[Trace]:
    stmt = select(Trace).where(Trace.agent_id == agent_id).order_by(Trace.created_at.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars())


async def sample_traces(db: AsyncSession, company_id: uuid.UUID, limit: int = 20) -> list[Trace]:
    stmt = select(Trace).where(Trace.company_id == company_id).order_by(func.random()).limit(limit)
    return list((await db.execute(stmt)).scalars())


# Costes: las trazas son la fuente única del gasto de IA
async def spend(
    db: AsyncSession, company_id: uuid.UUID, *, agent_id: uuid.UUID | None = None,
    since: datetime | None = None, until: datetime | None = None,
) -> Decimal:  # fmt: skip
    stmt = select(func.coalesce(func.sum(Trace.cost_eur), 0)).where(Trace.company_id == company_id)
    if agent_id:
        stmt = stmt.where(Trace.agent_id == agent_id)
    if since:
        stmt = stmt.where(Trace.created_at >= since)
    if until:
        stmt = stmt.where(Trace.created_at < until)
    return Decimal((await db.execute(stmt)).scalar_one())


async def spend_by_day(
    db: AsyncSession, company_id: uuid.UUID, since: date, agent_id: uuid.UUID | None = None
) -> list[dict[str, Any]]:
    day = cast(Trace.created_at, Date).label("day")
    stmt = select(day, func.sum(Trace.cost_eur)).where(Trace.company_id == company_id, Trace.created_at >= since)
    if agent_id:
        stmt = stmt.where(Trace.agent_id == agent_id)
    result = await db.execute(stmt.group_by(day).order_by(day))
    return [{"day": d.isoformat(), "cost_eur": float(c)} for d, c in result]


async def spend_by_agent(db: AsyncSession, company_id: uuid.UUID, since: date) -> dict[uuid.UUID, Decimal]:
    stmt = (
        select(Trace.agent_id, func.sum(Trace.cost_eur))
        .where(Trace.company_id == company_id, Trace.created_at >= since)
        .group_by(Trace.agent_id)
    )
    return {agent: Decimal(cost) for agent, cost in await db.execute(stmt)}


async def spend_by_task(db: AsyncSession, agent_id: uuid.UUID, limit: int = 30) -> list[dict[str, Any]]:
    stmt = (
        select(Trace.task_id, func.sum(Trace.cost_eur), func.sum(Trace.input_tokens + Trace.output_tokens))
        .where(Trace.agent_id == agent_id, Trace.task_id.isnot(None))
        .group_by(Trace.task_id)
        .limit(limit)
    )
    return [{"task_id": t, "cost_eur": float(c), "tokens": int(n)} for t, c, n in await db.execute(stmt)]


async def token_totals(db: AsyncSession, agent_id: uuid.UUID) -> dict[str, int]:
    stmt = select(func.coalesce(func.sum(Trace.input_tokens), 0), func.coalesce(func.sum(Trace.output_tokens), 0)).where(
        Trace.agent_id == agent_id
    )
    first = (await db.execute(stmt)).one()
    return {"input": int(first[0]), "output": int(first[1])}


# Anomalías
async def raise_anomaly(
    db: AsyncSession, company_id: uuid.UUID, agent_id: uuid.UUID | None, rule: str, severity: str,
    evidence: dict[str, Any],
) -> Anomaly | None:  # fmt: skip
    stmt = select(Anomaly).where(
        Anomaly.company_id == company_id, Anomaly.agent_id == agent_id, Anomaly.rule == rule, Anomaly.status == "open"
    )
    if (await db.execute(stmt)).scalars().first() is not None:
        return None
    anomaly = Anomaly(company_id=company_id, agent_id=agent_id, rule=rule, severity=severity, evidence=clean(evidence))
    db.add(anomaly)
    await db.flush()
    await record(db, company_id, "system", "audit.anomaly", str(agent_id or ""), {"rule": rule, "severity": severity})
    await emit(db, "audit.anomaly", {"id": anomaly.id, "agent_id": agent_id, "rule": rule, "severity": severity})
    await notify(db, company_id, "anomaly", f"Anomalía «{rule}» detectada", "/audit")
    return anomaly


async def anomalies(
    db: AsyncSession, company_id: uuid.UUID, status: str | None = None, agent_id: uuid.UUID | None = None
) -> list[Anomaly]:
    stmt = select(Anomaly).where(Anomaly.company_id == company_id)
    if status:
        stmt = stmt.where(Anomaly.status == status)
    if agent_id:
        stmt = stmt.where(Anomaly.agent_id == agent_id)
    return list((await db.execute(stmt.order_by(Anomaly.created_at.desc()).limit(200))).scalars())


async def set_anomaly_status(db: AsyncSession, company_id: uuid.UUID, anomaly_id: uuid.UUID, status: str) -> Anomaly:
    anomaly = await db.get(Anomaly, anomaly_id)
    if anomaly is None or anomaly.company_id != company_id:
        raise NotFound("Anomalía")
    anomaly.status = status
    await record(db, company_id, "owner", "audit.anomaly_closed", str(anomaly_id), {"status": status})
    return anomaly


async def open_anomaly_count(db: AsyncSession, company_id: uuid.UUID) -> int:
    stmt = select(func.count()).select_from(Anomaly).where(Anomaly.company_id == company_id, Anomaly.status == "open")
    return (await db.execute(stmt)).scalar_one()


async def count_events(db: AsyncSession, company_id: uuid.UUID, event_type: str, task_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(AuditEvent)
        .where(
            AuditEvent.company_id == company_id,
            AuditEvent.type == event_type,
            AuditEvent.data["task_id"].astext == str(task_id),
        )
    )
    waiting = sum(1 for e in _pending(db) if e[2] == event_type and e[4].get("task_id") == str(task_id))
    return (await db.execute(stmt)).scalar_one() + waiting


async def count_recent(db: AsyncSession, company_id: uuid.UUID, event_type: str, actor: str, hours: int = 24) -> int:
    since = utcnow() - timedelta(hours=hours)
    stmt = (
        select(func.count())
        .select_from(AuditEvent)
        .where(
            AuditEvent.company_id == company_id, AuditEvent.type == event_type, AuditEvent.target == actor,
            AuditEvent.created_at >= since,
        )
    )  # fmt: skip
    waiting = sum(1 for e in _pending(db) if e[2] == event_type and e[3] == actor)
    return (await db.execute(stmt)).scalar_one() + waiting


# Notificaciones
async def notify(db: AsyncSession, company_id: uuid.UUID, kind: str, title: str, link: str = "") -> Notification:
    owner = (await db.execute(text("select owner_id from companies where id = :id"), {"id": company_id})).scalar_one()
    item = Notification(owner_id=owner, kind=kind, title=title[:300], link=link)
    db.add(item)
    await db.flush()
    await emit(db, "notification.created", row(item))
    return item


async def notified_today(db: AsyncSession, owner_id: uuid.UUID, kind: str) -> bool:
    start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    stmt = select(Notification.id).where(
        Notification.owner_id == owner_id, Notification.kind == kind, Notification.created_at >= start
    )
    return (await db.execute(stmt.limit(1))).first() is not None


async def notifications(db: AsyncSession, owner_id: uuid.UUID) -> list[dict[str, Any]]:
    stmt = select(Notification).where(Notification.owner_id == owner_id).order_by(Notification.created_at.desc()).limit(50)
    return rows((await db.execute(stmt)).scalars())


async def mark_read(db: AsyncSession, owner_id: uuid.UUID) -> None:
    stmt = select(Notification).where(Notification.owner_id == owner_id, Notification.read_at.is_(None))
    for item in (await db.execute(stmt)).scalars():
        item.read_at = utcnow()
