import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.core.errors import AppError, NotFound
from app.core.events import emit
from app.core.util import row, rows
from app.domains.agents.models import Agent, AgentMemory, AgentPromptVersion, Message, Routine, Supervision
from app.domains.audit import service as audit_service
from app.domains.knowledge import service as knowledge_service

PROMPTS = Path(__file__).resolve().parents[2] / "prompts"
STATUSES = {
    "idle", "walking", "thinking", "working", "reviewing", "meeting", "resting",
    "waiting_approval", "flagged", "error", "paused",
}  # fmt: skip
MEMORY_KEEP = 20
ROLES = Path(__file__).resolve().parents[3] / "seeds" / "roles.yaml"


def role_catalog() -> dict[str, Any]:
    """Cargos opcionales para contratar: ninguno se crea solo."""
    catalog: dict[str, Any] = yaml.safe_load(ROLES.read_text(encoding="utf-8"))
    for role in (r for group in catalog["groups"] for r in group["roles"]):
        role["tools"] = [*catalog["base_tools"], *role.get("tools", [])]
    return {"groups": catalog["groups"]}


def default_prompt(role: str) -> str:
    path = PROMPTS / f"{Path(role).name}.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    template = (PROMPTS / "_plantilla.md").read_text(encoding="utf-8")
    known = next((r for g in role_catalog()["groups"] for r in g["roles"] if r["key"] == role), None)
    if known is None:
        return template.replace("{rol}", role)
    return template.replace("{rol}", f"{known['title']} ({known['code']}, {known['full']})").replace(
        "Cumple las tareas que te asignen con precisión.", known["description"]
    )


async def find(db: AsyncSession, agent_id: uuid.UUID) -> Agent | None:
    return await db.get(Agent, agent_id)


async def require(db: AsyncSession, agent_id: uuid.UUID | None) -> Agent:
    agent = await db.get(Agent, agent_id) if agent_id else None
    if agent is None:
        raise NotFound("Agente")
    return agent


async def get(db: AsyncSession, company_id: uuid.UUID, agent_id: uuid.UUID) -> Agent:
    agent = await db.get(Agent, agent_id)
    if agent is None or agent.company_id != company_id:
        raise NotFound("Agente")
    return agent


async def list_active(db: AsyncSession, company_id: uuid.UUID) -> list[Agent]:
    stmt = select(Agent).where(Agent.company_id == company_id, Agent.archived_at.is_(None)).order_by(Agent.created_at)
    return list((await db.execute(stmt)).scalars())


async def by_role(db: AsyncSession, company_id: uuid.UUID, role: str) -> Agent | None:
    stmt = select(Agent).where(Agent.company_id == company_id, Agent.role == role, Agent.archived_at.is_(None))
    return (await db.execute(stmt)).scalars().first()


async def summaries(db: AsyncSession, company_id: uuid.UUID) -> list[dict[str, Any]]:
    return [row(a) for a in await list_active(db, company_id)]


async def agents_in_room(db: AsyncSession, room_id: uuid.UUID) -> list[Agent]:
    stmt = select(Agent).where(Agent.home_room_id == room_id, Agent.archived_at.is_(None))
    return list((await db.execute(stmt)).scalars())


async def seats_in_room(db: AsyncSession, room_id: uuid.UUID) -> set[tuple[int, int]]:
    return {(a.seat_x, a.seat_y) for a in await agents_in_room(db, room_id)}


async def occupied_tiles(db: AsyncSession, company_id: uuid.UUID, exclude: uuid.UUID) -> set[tuple[int, int]]:
    return {(a.pos_x, a.pos_y) for a in await list_active(db, company_id) if a.id != exclude}


async def create(
    db: AsyncSession,
    company_id: uuid.UUID,
    *,
    name: str,
    role: str,
    seat: tuple[int, int] = (0, 0),
    system_prompt: str | None = None,
    **fields: Any,
) -> Agent:
    budget = Decimal(str(fields.pop("daily_budget_eur", "0.5")))
    agent = Agent(
        company_id=company_id, name=name, role=role, seat_x=seat[0], seat_y=seat[1], pos_x=seat[0], pos_y=seat[1],
        daily_budget_eur=budget, idle_since=utcnow(), **fields,
    )  # fmt: skip
    agent.current_room_id = agent.home_room_id
    db.add(agent)
    await db.flush()
    db.add(AgentPromptVersion(agent_id=agent.id, version=1, system_prompt=system_prompt or default_prompt(role)))
    db.add(Routine(agent_id=agent.id, rules={}))
    await db.flush()
    await knowledge_service.ensure_base(db, company_id, "agent", agent.id, f"Conocimiento de {name}")
    await emit(db, "agent.created", row(agent))
    await audit_service.record(db, company_id, "owner", "agent.created", str(agent.id), {"name": name, "role": role})
    return agent


async def update_agent(db: AsyncSession, agent: Agent, fields: dict[str, Any]) -> Agent:
    moved_department = "department_id" in fields or "home_room_id" in fields
    if "manager_id" in fields and fields["manager_id"] is not None:
        await _check_no_cycle(db, agent, fields["manager_id"])
    for key, value in fields.items():
        setattr(agent, key, value)
    await db.flush()
    if moved_department:
        await knowledge_service.grant_inherited(db, agent)
    await audit_service.record(db, agent.company_id, "owner", "agent.updated", str(agent.id), {"fields": sorted(fields)})
    await emit(db, "agent.updated", row(agent))
    return agent


async def _check_no_cycle(db: AsyncSession, agent: Agent, manager_id: uuid.UUID) -> None:
    seen = {agent.id}
    current: uuid.UUID | None = manager_id
    while current is not None:
        if current in seen:
            raise AppError("hierarchy_cycle", "Ese jefe crearía un ciclo en el organigrama", 422)
        seen.add(current)
        manager = await db.get(Agent, current)
        current = manager.manager_id if manager else None


async def clone(db: AsyncSession, agent: Agent) -> Agent:
    prompt = await current_prompt(db, agent.id)
    return await create(
        db, agent.company_id, name=f"{agent.name} (copia)", role=agent.role,
        seat=(agent.seat_x, agent.seat_y), system_prompt=prompt.system_prompt,
        department_id=agent.department_id, home_room_id=agent.home_room_id, manager_id=agent.manager_id,
        model=agent.model, temperature=agent.temperature, tools=list(agent.tools),
        daily_budget_eur=agent.daily_budget_eur, personality=agent.personality, avatar=agent.avatar,
    )  # fmt: skip


async def archive(db: AsyncSession, agent: Agent) -> None:
    agent.archived_at = utcnow()
    agent.status = "paused"
    await db.execute(update(Agent).where(Agent.manager_id == agent.id).values(manager_id=agent.manager_id))
    await audit_service.record(db, agent.company_id, "owner", "agent.archived", str(agent.id), {})
    await emit(db, "agent.archived", {"agent_id": agent.id})


async def set_status(
    db: AsyncSession, agent: Agent, status: str, *, tool: str | None = None, room_id: uuid.UUID | None = None
) -> None:
    if agent.status == "paused" and status != "paused" and status != "idle":
        return
    agent.status = status
    agent.idle_since = utcnow() if status == "idle" else None
    if status != "resting":
        agent.resting_since = None
    await db.flush()
    await emit(
        db,
        "agent.status",
        {"agent_id": agent.id, "status": status, "tool": tool, "room_id": room_id, "task_id": agent.current_task_id},
    )


async def pause(db: AsyncSession, agent: Agent, reason: str, actor: str) -> None:
    agent.pause_reason = reason[:200]
    await set_status(db, agent, "paused")
    await audit_service.record(db, agent.company_id, actor, "agent.paused", str(agent.id), {"reason": reason})


async def resume(db: AsyncSession, agent: Agent, actor: str = "owner") -> None:
    agent.pause_reason = ""
    await set_status(db, agent, "idle")
    await audit_service.record(db, agent.company_id, actor, "agent.resumed", str(agent.id), {})


async def claim(db: AsyncSession, agent_id: uuid.UUID, task_id: uuid.UUID) -> bool:
    """Un agente ejecuta una sola tarea a la vez."""
    result = await db.execute(
        update(Agent)
        .where(Agent.id == agent_id, or_(Agent.current_task_id.is_(None), Agent.current_task_id == task_id))
        .values(current_task_id=task_id)
        .returning(Agent.id)
    )
    claimed = result.first() is not None
    agent = await db.get(Agent, agent_id)
    if agent is not None:
        await db.refresh(agent)
    return claimed


async def release(db: AsyncSession, agent: Agent) -> None:
    agent.current_task_id = None
    await db.flush()


async def clear_claims(db: AsyncSession) -> None:
    await db.execute(update(Agent).where(Agent.current_task_id.isnot(None)).values(current_task_id=None))


# Prompts
async def current_prompt(db: AsyncSession, agent_id: uuid.UUID) -> AgentPromptVersion:
    stmt = (
        select(AgentPromptVersion)
        .where(AgentPromptVersion.agent_id == agent_id)
        .order_by(AgentPromptVersion.version.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one()


async def prompt_versions(db: AsyncSession, agent_id: uuid.UUID) -> list[AgentPromptVersion]:
    stmt = (
        select(AgentPromptVersion).where(AgentPromptVersion.agent_id == agent_id).order_by(AgentPromptVersion.version.desc())
    )
    return list((await db.execute(stmt)).scalars())


async def add_prompt_version(
    db: AsyncSession, agent: Agent, system_prompt: str, note: str, author: str = "owner"
) -> AgentPromptVersion:
    version = (await current_prompt(db, agent.id)).version + 1
    entry = AgentPromptVersion(agent_id=agent.id, version=version, system_prompt=system_prompt, note=note, author=author)
    db.add(entry)
    await db.flush()
    await audit_service.record(db, agent.company_id, author, "agent.prompt_changed", str(agent.id), {"version": version})
    return entry


async def restore_prompt(db: AsyncSession, agent: Agent, version: int) -> AgentPromptVersion:
    for entry in await prompt_versions(db, agent.id):
        if entry.version == version:
            return await add_prompt_version(db, agent, entry.system_prompt, f"Restaurada la versión {version}")
    raise NotFound("Versión")


# Jerarquía y supervisión
async def subordinates(db: AsyncSession, agent_id: uuid.UUID) -> list[Agent]:
    stmt = select(Agent).where(Agent.manager_id == agent_id, Agent.archived_at.is_(None))
    return list((await db.execute(stmt)).scalars())


async def org_chart(db: AsyncSession, company_id: uuid.UUID) -> list[dict[str, Any]]:
    agents = await list_active(db, company_id)
    nodes: dict[uuid.UUID, dict[str, Any]] = {
        a.id: {"id": a.id, "name": a.name, "role": a.role, "status": a.status,
               "department_id": a.department_id, "reports": []}
        for a in agents
    }  # fmt: skip
    roots: list[dict[str, Any]] = []
    for agent in agents:
        parent = nodes.get(agent.manager_id) if agent.manager_id else None
        (parent["reports"] if parent else roots).append(nodes[agent.id])
    return roots


async def add_supervision(
    db: AsyncSession, supervisor_id: uuid.UUID, supervised_id: uuid.UUID, kind: str,
    tools: list[str] | None = None, escalate_after_min: int | None = None,
) -> Supervision:  # fmt: skip
    if kind not in {"review", "pre_approval", "observer"}:
        raise AppError("invalid_kind", "Tipo de supervisión no válido", 422)
    if supervisor_id == supervised_id:
        raise AppError("self_supervision", "Un agente no puede supervisarse a sí mismo", 422)
    item = Supervision(
        supervisor_id=supervisor_id, supervised_id=supervised_id, kind=kind,
        tools=tools or [], escalate_after_min=escalate_after_min,
    )  # fmt: skip
    db.add(item)
    await db.flush()
    return item


async def supervisions(db: AsyncSession, company_id: uuid.UUID) -> list[Supervision]:
    stmt = select(Supervision).join(Agent, Agent.id == Supervision.supervised_id).where(Agent.company_id == company_id)
    return list((await db.execute(stmt)).scalars())


async def remove_supervision(db: AsyncSession, supervision_id: uuid.UUID) -> None:
    item = await db.get(Supervision, supervision_id)
    if item is None:
        raise NotFound("Supervisión")
    await db.delete(item)


async def supervisors_of(db: AsyncSession, agent_id: uuid.UUID, kind: str) -> list[Supervision]:
    stmt = select(Supervision).where(Supervision.supervised_id == agent_id, Supervision.kind == kind)
    return list((await db.execute(stmt)).scalars())


async def reviewer_for(db: AsyncSession, agent: Agent) -> uuid.UUID | None:
    configured = await supervisors_of(db, agent.id, "review")
    return configured[0].supervisor_id if configured else agent.manager_id


async def pre_approver(db: AsyncSession, agent: Agent, tool: str) -> Supervision | None:
    for item in await supervisors_of(db, agent.id, "pre_approval"):
        if tool in item.tools:
            return item
    return None


# Memoria
async def memories(db: AsyncSession, agent_id: uuid.UUID) -> list[AgentMemory]:
    stmt = select(AgentMemory).where(AgentMemory.agent_id == agent_id).order_by(AgentMemory.created_at.desc())
    return list((await db.execute(stmt)).scalars())


async def add_memory(db: AsyncSession, agent: Agent, summary: str, task_ids: list[str]) -> AgentMemory:
    entry = AgentMemory(agent_id=agent.id, summary=summary[:2000], source_task_ids=task_ids)
    db.add(entry)
    await db.flush()
    return entry


async def memory_count(db: AsyncSession, agent_id: uuid.UUID) -> int:
    stmt = select(func.count()).select_from(AgentMemory).where(AgentMemory.agent_id == agent_id)
    return (await db.execute(stmt)).scalar_one()


async def memory_digest(db: AsyncSession, agent_id: uuid.UUID, limit: int = 5) -> str:
    return "\n".join(f"- {m.summary}" for m in (await memories(db, agent_id))[:limit])


async def get_memory(db: AsyncSession, agent_id: uuid.UUID, memory_id: uuid.UUID) -> AgentMemory:
    entry = await db.get(AgentMemory, memory_id)
    if entry is None or entry.agent_id != agent_id:
        raise NotFound("Memoria")
    return entry


async def find_memory(db: AsyncSession, memory_id: uuid.UUID) -> AgentMemory | None:
    return await db.get(AgentMemory, memory_id)


async def delete_memories(db: AsyncSession, entries: list[AgentMemory]) -> None:
    for entry in entries:
        await db.delete(entry)
    await db.flush()


async def routine_rules(db: AsyncSession, agent_id: uuid.UUID) -> dict[str, Any]:
    routine = (await db.execute(select(Routine).where(Routine.agent_id == agent_id))).scalar_one_or_none()
    return routine.rules if routine else {}


async def set_routine(db: AsyncSession, agent_id: uuid.UUID, rules: dict[str, Any]) -> None:
    routine = (await db.execute(select(Routine).where(Routine.agent_id == agent_id))).scalar_one()
    routine.rules = rules
    await db.flush()


# Chat
async def add_message(
    db: AsyncSession, agent_id: uuid.UUID, role: str, content: str,
    citations: list[dict[str, Any]] | None = None, task_id: uuid.UUID | None = None,
) -> Message:  # fmt: skip
    message = Message(agent_id=agent_id, role=role, content=content, citations=citations or [], task_id=task_id)
    db.add(message)
    await db.flush()
    return message


async def messages(db: AsyncSession, agent_id: uuid.UUID, limit: int = 100) -> list[Message]:
    stmt = select(Message).where(Message.agent_id == agent_id).order_by(Message.created_at.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars())[::-1]


async def memories_dicts(db: AsyncSession, agent_id: uuid.UUID) -> list[dict[str, Any]]:
    return rows(await memories(db, agent_id))
