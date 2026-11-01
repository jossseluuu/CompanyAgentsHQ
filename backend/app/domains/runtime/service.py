"""Interfaz pública del motor: encola trabajo, reanuda, y ejecuta el pulso periódico."""

import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import plugins
from app.core.config import get_settings
from app.core.db import session_scope, utcnow
from app.core.errors import AppError
from app.core.events import Event, bus
from app.core.util import as_uuid, row
from app.domains.agents import service as agents_service
from app.domains.approvals import service as approvals_service
from app.domains.audit import anomalies
from app.domains.audit import service as audit_service
from app.domains.finance import service as finance_service
from app.domains.knowledge import embeddings
from app.domains.knowledge import service as knowledge_service
from app.domains.office import service as office_service
from app.domains.runtime import loop, profile
from app.domains.runtime.llm.router import ollama_models
from app.domains.runtime.queue import enqueue
from app.domains.tasks import service as tasks_service

DAY_SECONDS = 86400
HOUR_SECONDS = 3600
LEASE_SECONDS = 300


async def agent_profile(db: AsyncSession, agent: Any) -> dict[str, Any]:
    return await profile.build(db, agent)


async def request_plan(db: AsyncSession, goal: Any) -> None:
    enqueue(db, "plan_goal", goal.id)


async def request_chat_reply(db: AsyncSession, agent: Any, message_id: uuid.UUID) -> None:
    enqueue(db, "chat_reply", agent.id, message_id)


async def request_indexing(db: AsyncSession, document_ids: list[uuid.UUID]) -> None:
    for document_id in document_ids:
        enqueue(db, "index_document", document_id)


async def request_meeting(db: AsyncSession, meeting: Any) -> None:
    enqueue(db, "run_meeting", meeting.id)


async def agent_hired(db: AsyncSession, agent: Any) -> None:
    await knowledge_service.grant_inherited(db, agent)
    if agent.home_room_id and (agent.seat_x, agent.seat_y) == (0, 0):
        await office_service.assign_seat(db, agent)


async def create_owner_task(db: AsyncSession, company_id: uuid.UUID, fields: dict[str, Any]) -> Any:
    agent = await agents_service.get(db, company_id, fields["agent_id"])
    room_id = fields.get("room_id") or agent.home_room_id
    task = await tasks_service.create_task(
        db, company_id, title=fields["title"], instructions=fields["instructions"], agent_id=agent.id, room_id=room_id,
        priority=fields["priority"], due_at=fields["due_at"], recurrence=fields["recurrence"],
        depends_on=fields["depends_on"],
    )  # fmt: skip
    enqueue(db, "run_task", task.id)
    return task


async def approve_plan(db: AsyncSession, goal: Any, edited: dict[str, Any] | None) -> None:
    if goal.status != "plan_review":
        raise AppError("invalid_state", "El objetivo no tiene un plan por revisar", 409)
    if edited is not None:
        goal.plan = edited
    goal.approved_at = utcnow()
    ceo = await agents_service.by_role(db, goal.company_id, "ceo")
    created = 0
    for item in (goal.plan or {}).get("tasks", []):
        agent = await agents_service.by_role(db, goal.company_id, item["role"])
        if agent is None:
            continue
        task = await tasks_service.create_task(
            db, goal.company_id, title=item["title"], instructions=item["instructions"], agent_id=agent.id,
            room_id=agent.home_room_id, goal_id=goal.id, requested_by=ceo.id if ceo else None,
            reviewer_id=ceo.id if ceo else None, due_at=goal.due_at,
        )  # fmt: skip
        enqueue(db, "run_task", task.id)
        created += 1
    await tasks_service.set_goal_status(db, goal, "running" if created else "failed")
    await audit_service.record(db, goal.company_id, "owner", "goal.plan_approved", str(goal.id), {"tasks": created})


async def retry_task(db: AsyncSession, task: Any) -> None:
    if task.status not in {"failed", "cancelled"}:
        raise AppError("invalid_state", "Solo se reintentan tareas fallidas o canceladas", 409)
    task.error = ""
    task.steps_used = 0
    task.conversation = []
    await tasks_service.set_status(db, task, "pending")
    agent = await agents_service.require(db, task.assigned_agent_id)
    if agent is not None and agent.status == "error":
        await agents_service.set_status(db, agent, "idle")
    enqueue(db, "run_task", task.id)


async def cancel_task(db: AsyncSession, task: Any) -> None:
    if task.status not in tasks_service.OPEN:
        raise AppError("invalid_state", "La tarea ya terminó", 409)
    await tasks_service.set_status(db, task, "cancelled")
    await audit_service.record(db, task.company_id, "owner", "task.cancelled", str(task.id), {"task_id": task.id})
    for child in await tasks_service.children(db, task.id):
        if child.status in tasks_service.OPEN:
            await cancel_task(db, child)
    agent = await agents_service.require(db, task.assigned_agent_id) if task.assigned_agent_id else None
    if agent is not None and agent.status == "waiting_approval":
        await agents_service.set_status(db, agent, "idle")


async def apply_decision(db: AsyncSession, approval: Any, approve: bool, comment: str, actor: str) -> None:
    await approvals_service.decide(db, approval, approve, comment, actor)
    task = await tasks_service.find_task(db, approval.task_id) if approval.task_id else None
    if task is None or task.status != "blocked":
        return
    agent = await agents_service.require(db, task.assigned_agent_id)
    if agent is not None and agent.status == "waiting_approval":
        await agents_service.set_status(db, agent, "idle")
    if approval.action_type == "review_escalation":
        if approve:
            await loop.complete_task(db, task)
        else:
            task.error = comment or "Rechazada por el dueño tras varias devoluciones"
            await tasks_service.set_status(db, task, "failed")
        return
    await tasks_service.set_status(db, task, "pending", blocked_reason=f"{loop.RESUME_PREFIX}{approval.id}")
    enqueue(db, "run_task", task.id)


async def approvals_with_context(db: AsyncSession, company_id: uuid.UUID, status: str | None) -> list[dict[str, Any]]:
    agents = {a.id: a for a in await agents_service.list_active(db, company_id)}
    result = []
    for approval in await approvals_service.listing(db, company_id, status):
        requester = agents.get(approval.requester_agent_id) if approval.requester_agent_id else None
        data = row(approval)
        data["requester_name"] = requester.name if requester else "Sistema"
        result.append(data)
    return result


async def resume_agent(db: AsyncSession, agent: Any) -> None:
    await agents_service.resume(db, agent)
    await _unblock(db, agent.company_id, agent.id)


async def reset_agent(db: AsyncSession, agent: Any) -> None:
    """Reinicia el agente: libera su tarea y limpia el estado de error."""
    agent.pause_reason = ""
    agent.current_task_id = None
    agent.status = "idle"
    await agents_service.set_status(db, agent, "idle")
    await audit_service.record(db, agent.company_id, "owner", "agent.reset", str(agent.id), {})
    await _unblock(db, agent.company_id, agent.id)


async def _unblock(db: AsyncSession, company_id: uuid.UUID, agent_id: uuid.UUID | None) -> None:
    held = await tasks_service.by_status(db, company_id, ["blocked", "pending", "in_review"])
    for task in held:
        if task.status == "in_review" and (agent_id is None or task.reviewer_agent_id == agent_id):
            enqueue(db, "review_task", task.id)
            continue
        if agent_id is not None and task.assigned_agent_id != agent_id:
            continue
        if task.status == "blocked" and task.blocked_reason in {"budget", "provider", "agent_paused"}:
            await tasks_service.set_status(db, task, "pending")
            enqueue(db, "run_task", task.id)
        elif task.status == "pending":
            enqueue(db, "run_task", task.id)


async def resume_company(db: AsyncSession, company_id: uuid.UUID) -> None:
    await _unblock(db, company_id, None)


async def status_bar(db: AsyncSession, company: Any) -> dict[str, Any]:
    today = await finance_service.spend_on(db, company.id, utcnow().date())
    return {
        "company": company.name,
        "status": company.status,
        "spend_today_eur": today,
        "daily_limit_eur": float(company.daily_budget_eur),
        "pending_approvals": await approvals_service.pending_count(db, company.id),
        "open_anomalies": await audit_service.open_anomaly_count(db, company.id),
    }


def public_ai_settings(company: Any) -> dict[str, Any]:
    return {k: v for k, v in (company.ai_settings or {}).items() if not k.startswith("_")}


async def ai_overview(company: Any) -> dict[str, Any]:
    settings = get_settings()
    active = embeddings.provider_for(company.ai_settings or {})
    return {
        "settings": public_ai_settings(company),
        "llm_provider": settings.llm_provider,
        "defaults": {"powerful": settings.model_powerful, "fast": settings.model_fast},
        "active_embeddings": active.key,
        "ollama_models": await ollama_models(),
        "downloaded_models": embeddings.downloaded_models(),
        "embedding_providers": ["hash", "ollama", "sentence_transformers", "openai_compatible"],
    }


async def update_ai(db: AsyncSession, company: Any, fields: dict[str, Any]) -> None:
    before = embeddings.provider_for(company.ai_settings or {}).key
    company.ai_settings = {**(company.ai_settings or {}), **{k: v for k, v in fields.items() if v is not None}}
    await db.flush()
    await audit_service.record(db, company.id, "owner", "company.ai_changed", "", {"fields": sorted(fields)})
    if embeddings.provider_for(company.ai_settings).key != before:
        await request_indexing(db, await knowledge_service.all_documents(db, company.id))


async def recover(lease_seconds: int = LEASE_SECONDS) -> int:
    """Retoma el trabajo sin dueño tras un reinicio (RNF-FIA-01)."""
    limit = utcnow() - timedelta(seconds=lease_seconds)
    resumed = 0
    async with session_scope() as db:
        for task in await tasks_service.stuck_everywhere(db):
            if task.updated_at > limit:
                continue
            resumed += 1
            if task.status == "in_review":
                enqueue(db, "review_task", task.id)
                continue
            agent = await agents_service.require(db, task.assigned_agent_id)
            if agent is not None and agent.current_task_id == task.id:
                agent.current_task_id = None
            task.status = "pending"
            enqueue(db, "run_task", task.id)
    return resumed


async def _due(company: Any, key: str, every_seconds: int) -> bool:
    """Marca en ai_settings cuándo corrió por última vez cada trabajo periódico."""
    state = dict(company.ai_settings or {})
    last = state.get(f"_last_{key}", 0)
    now = int(utcnow().timestamp())
    if now - last < every_seconds:
        return False
    company.ai_settings = {**state, f"_last_{key}": now}
    return True


async def tick(db: AsyncSession, company: Any) -> None:
    """Pulso periódico: descansos, escalados, recurrentes y publicaciones."""
    settings = get_settings()
    if company.status == "paused":
        return
    now = utcnow()
    rest_after = timedelta(seconds=settings.idle_rest_seconds)
    for agent in await agents_service.list_active(db, company.id):
        if agent.status == "idle" and agent.idle_since and now - agent.idle_since >= rest_after:
            await agents_service.set_status(db, agent, "resting")
            agent.resting_since = now
        elif agent.status == "idle":
            following = await tasks_service.next_pending(db, agent.id)
            if following is not None and agent.current_task_id is None:
                enqueue(db, "run_task", following.id)

    for approval in await approvals_service.overdue(db, company.id):
        if approval.expires_at and approval.expires_at < now and approval.approver_agent_id is None:
            await apply_decision(db, approval, False, "Caducada sin respuesta", "system")
            continue
        if approval.requester_agent_id is None:
            continue
        supervision = next(
            (s for s in await agents_service.supervisors_of(db, approval.requester_agent_id, "pre_approval")
             if s.supervisor_id == approval.approver_agent_id),
            None,
        )  # fmt: skip
        minutes = supervision.escalate_after_min if supervision else None
        if minutes and now - approval.created_at >= timedelta(minutes=minutes):
            await loop.escalate(db, approval)

    for task in await tasks_service.recurring_done(db, company.id):
        wait = {"daily": DAY_SECONDS, "weekly": 7 * DAY_SECONDS}.get(task.recurrence)
        if wait and (now - task.updated_at).total_seconds() >= wait:
            repeat = await tasks_service.create_task(
                db, company.id, title=task.title, instructions=task.instructions, agent_id=task.assigned_agent_id,
                room_id=task.room_id, priority=task.priority, recurrence=task.recurrence,
            )  # fmt: skip
            task.recurrence = ""
            enqueue(db, "run_task", repeat.id)

    if await _due(company, "integrity", HOUR_SECONDS):
        await anomalies.check_integrity(db, company.id)
    if await _due(company, "publish", DAY_SECONDS):
        await publish_knowledge(db, company.id)
    if await _due(company, "auditor", DAY_SECONDS):
        enqueue(db, "auditor_report", company.id)


async def publish_knowledge(db: AsyncSession, company_id: uuid.UUID) -> list[uuid.UUID]:
    pairs = [(r, await office_service.room_modules(db, r.id)) for r in await office_service.list_rooms(db, company_id)]
    published = await knowledge_service.publish_module_sources(db, company_id, pairs)
    await request_indexing(db, published)
    return published


async def tick_all() -> None:
    from sqlalchemy import select

    from app.domains.company.models import Company

    async with session_scope() as db:
        for company in (await db.execute(select(Company))).scalars():
            await tick(db, company)
    await recover()


async def on_agent_arrived(event: Event) -> None:
    if event.data.get("reason") != "resting":
        return
    async with session_scope() as db:
        enqueue(db, "consolidate_memory", as_uuid(event.data["agent_id"]))


def register() -> None:
    plugins.discover()
    office_service.register()
    bus.subscribe("agent.arrived", on_agent_arrived)
