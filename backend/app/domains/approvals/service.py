import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.core.errors import AppError, NotFound
from app.core.events import emit
from app.core.util import row
from app.domains.approvals.models import Approval
from app.domains.audit import service as audit_service


async def create(
    db: AsyncSession,
    company_id: uuid.UUID,
    *,
    requester_id: uuid.UUID | None,
    task_id: uuid.UUID | None,
    action_type: str,
    payload: dict[str, Any],
    approver_id: uuid.UUID | None = None,
    expires_in_hours: int | None = None,
) -> Approval:
    expires = utcnow() + timedelta(hours=expires_in_hours) if expires_in_hours else None
    approval = Approval(
        company_id=company_id, requester_agent_id=requester_id, approver_agent_id=approver_id, task_id=task_id,
        action_type=action_type, payload=payload, expires_at=expires,
    )  # fmt: skip
    db.add(approval)
    await db.flush()
    await audit_service.record(
        db, company_id, str(requester_id or "system"), "approval.requested", str(approval.id),
        {"action": action_type, "task_id": task_id, "approver": approver_id},
    )  # fmt: skip
    await emit(db, "approval.created", row(approval))
    if approver_id is None:
        await audit_service.notify(db, company_id, "approval", f"Aprobación pendiente: {action_type}", "/approvals")
    return approval


async def get(db: AsyncSession, company_id: uuid.UUID, approval_id: uuid.UUID) -> Approval:
    approval = await db.get(Approval, approval_id)
    if approval is None or approval.company_id != company_id:
        raise NotFound("Aprobación")
    return approval


async def get_any(db: AsyncSession, approval_id: uuid.UUID) -> Approval:
    approval = await db.get(Approval, approval_id)
    if approval is None:
        raise NotFound("Aprobación")
    return approval


async def listing(db: AsyncSession, company_id: uuid.UUID, status: str | None) -> list[Approval]:
    stmt = select(Approval).where(Approval.company_id == company_id)
    if status:
        stmt = stmt.where(Approval.status == status)
    return list((await db.execute(stmt.order_by(Approval.created_at.desc()).limit(200))).scalars())


async def pending_count(db: AsyncSession, company_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(Approval)
        .where(Approval.company_id == company_id, Approval.status == "pending", Approval.approver_agent_id.is_(None))
    )
    return (await db.execute(stmt)).scalar_one()


async def decide(db: AsyncSession, approval: Approval, approve: bool, comment: str, actor: str) -> None:
    if approval.status != "pending":
        raise AppError("already_decided", "Esta aprobación ya está resuelta", 409)
    approval.status = "approved" if approve else "rejected"
    approval.comment = comment
    approval.decided_at = utcnow()
    await audit_service.record(
        db, approval.company_id, actor, "approval.decided", str(approval.id),
        {"approved": approve, "comment": comment, "task_id": approval.task_id},
    )  # fmt: skip
    await emit(db, "approval.decided", {"id": approval.id, "status": approval.status, "task_id": approval.task_id})


async def overdue(db: AsyncSession, company_id: uuid.UUID) -> list[Approval]:
    """Pendientes de un supervisor o caducadas."""
    now = utcnow()
    stmt = select(Approval).where(
        Approval.company_id == company_id,
        Approval.status == "pending",
        or_(Approval.expires_at < now, Approval.approver_agent_id.isnot(None)),
    )
    return list((await db.execute(stmt)).scalars())
