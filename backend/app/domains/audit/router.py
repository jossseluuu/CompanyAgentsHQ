import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentOwner
from app.core.db import get_db
from app.core.util import row, rows
from app.domains.audit import service
from app.domains.company.service import CompanyDep

router = APIRouter(tags=["audit"])
Db = Annotated[AsyncSession, Depends(get_db)]


class AnomalyPatch(BaseModel):
    status: str


async def _events(
    company: CompanyDep,
    db: Db,
    agent: str | None = None,
    type: str | None = None,  # noqa: A002
    room: str | None = None,
    start: Annotated[datetime | None, Query(alias="from")] = None,
    end: Annotated[datetime | None, Query(alias="to")] = None,
    limit: int = Query(200, le=5000),
) -> list[Any]:
    return await service.list_events(
        db, company.id, agent=agent, event_type=type, room=room, start=start, end=end, limit=limit
    )


Events = Annotated[list[Any], Depends(_events)]


@router.get("/audit/events")
async def events(found: Events) -> list[dict[str, Any]]:
    return rows(found)


@router.get("/events")
async def events_alias(found: Events) -> list[dict[str, Any]]:
    return rows(found)


@router.get("/audit/export")
async def export(found: Events, format: str = "csv") -> Response:  # noqa: A002
    fmt = "json" if format == "json" else "csv"
    return Response(
        service.export(found, fmt),
        media_type="application/json" if fmt == "json" else "text/csv",
        headers={"Content-Disposition": f"attachment; filename=auditoria.{fmt}"},
    )


@router.get("/audit/verify")
async def verify(company: CompanyDep, db: Db) -> dict[str, Any]:
    return await service.verify(db, company.id)


@router.get("/audit/anomalies")
async def anomalies(
    company: CompanyDep, db: Db, status: str | None = None, agent: uuid.UUID | None = None
) -> list[dict[str, Any]]:
    return rows(await service.anomalies(db, company.id, status, agent))


@router.patch("/audit/anomalies/{anomaly_id}")
async def close_anomaly(anomaly_id: uuid.UUID, body: AnomalyPatch, company: CompanyDep, db: Db) -> dict[str, Any]:
    return row(await service.set_anomaly_status(db, company.id, anomaly_id, body.status))


@router.get("/tasks/{task_id}/trace")
async def trace(task_id: uuid.UUID, _: CompanyDep, db: Db) -> list[dict[str, Any]]:
    return rows(await service.task_traces(db, task_id))


@router.get("/notifications")
async def notifications(owner: CurrentOwner, db: Db) -> list[dict[str, Any]]:
    return await service.notifications(db, owner.id)


@router.post("/notifications/read")
async def read(owner: CurrentOwner, db: Db) -> dict[str, bool]:
    await service.mark_read(db, owner.id)
    return {"ok": True}
