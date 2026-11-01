import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFound
from app.core.events import emit
from app.core.util import row
from app.domains.audit import service as audit_service
from app.domains.tasks.models import Goal, Meeting, Task, TaskDependency

OPEN = {"pending", "in_progress", "in_review", "blocked"}
BOARD_COLUMNS = {"pending": "Pendiente", "in_progress": "En curso", "in_review": "En revisión",
                 "blocked": "Bloqueada", "done": "Hecha"}  # fmt: skip
PUBLIC_EXCLUDE = ("conversation",)


async def get_task(db: AsyncSession, company_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    task = await db.get(Task, task_id)
    if task is None or task.company_id != company_id:
        raise NotFound("Tarea")
    return task


async def find_task(db: AsyncSession, task_id: uuid.UUID) -> Task | None:
    return await db.get(Task, task_id)


async def create_task(
    db: AsyncSession,
    company_id: uuid.UUID,
    *,
    title: str,
    instructions: str = "",
    agent_id: uuid.UUID | None = None,
    room_id: uuid.UUID | None = None,
    priority: int = 2,
    due_at: datetime | None = None,
    goal_id: uuid.UUID | None = None,
    parent_task_id: uuid.UUID | None = None,
    requested_by: uuid.UUID | None = None,
    reviewer_id: uuid.UUID | None = None,
    depth: int = 0,
    recurrence: str = "",
    depends_on: list[uuid.UUID] | None = None,
) -> Task:
    task = Task(
        company_id=company_id, title=title[:200], instructions=instructions, assigned_agent_id=agent_id,
        room_id=room_id, priority=priority, due_at=due_at, goal_id=goal_id, parent_task_id=parent_task_id,
        requested_by_agent_id=requested_by, reviewer_agent_id=reviewer_id, depth=depth, recurrence=recurrence,
    )  # fmt: skip
    db.add(task)
    await db.flush()
    for dependency in depends_on or []:
        db.add(TaskDependency(task_id=task.id, depends_on_task_id=dependency))
    await audit_service.record(
        db, company_id, str(requested_by or "owner"), "task.created", str(task.id),
        {"title": task.title, "agent_id": agent_id, "room_id": room_id, "task_id": task.id},
    )  # fmt: skip
    await emit(db, "task.updated", row(task, *PUBLIC_EXCLUDE))
    return task


async def set_status(db: AsyncSession, task: Task, status: str, *, blocked_reason: str = "") -> None:
    task.status = status
    task.blocked_reason = blocked_reason
    await db.flush()
    await emit(db, "task.updated", row(task, *PUBLIC_EXCLUDE))
    if status == "in_review":
        await emit(db, "supervision.review", {"task_id": task.id, "reviewer_id": task.reviewer_agent_id})


async def patch(db: AsyncSession, task: Task, fields: dict[str, Any]) -> Task:
    for key, value in fields.items():
        setattr(task, key, value)
    await db.flush()
    await audit_service.record(
        db, task.company_id, "owner", "task.updated", str(task.id), {"fields": sorted(fields), "task_id": task.id}
    )
    await emit(db, "task.updated", row(task, *PUBLIC_EXCLUDE))
    return task


async def board(db: AsyncSession, room_id: uuid.UUID) -> dict[str, list[dict[str, Any]]]:
    stmt = select(Task).where(Task.room_id == room_id, Task.status.in_(list(BOARD_COLUMNS) + ["failed"]))
    columns: dict[str, list[dict[str, Any]]] = {key: [] for key in [*BOARD_COLUMNS, "failed"]}
    tasks = list((await db.execute(stmt.order_by(Task.priority, Task.created_at))).scalars())
    links = select(TaskDependency).where(TaskDependency.task_id.in_([t.id for t in tasks]))
    waits: dict[uuid.UUID, list[str]] = {}
    for link in (await db.execute(links)).scalars():
        waits.setdefault(link.task_id, []).append(str(link.depends_on_task_id))
    for task in tasks:
        columns[task.status].append({**row(task, *PUBLIC_EXCLUDE), "depends_on": waits.get(task.id, [])})
    return columns


async def list_tasks(db: AsyncSession, company_id: uuid.UUID, agent_id: uuid.UUID | None = None) -> list[Task]:
    stmt = select(Task).where(Task.company_id == company_id)
    if agent_id:
        stmt = stmt.where(Task.assigned_agent_id == agent_id)
    return list((await db.execute(stmt.order_by(Task.created_at.desc()).limit(300))).scalars())


async def children(db: AsyncSession, task_id: uuid.UUID) -> list[Task]:
    return list((await db.execute(select(Task).where(Task.parent_task_id == task_id))).scalars())


async def next_pending(db: AsyncSession, agent_id: uuid.UUID) -> Task | None:
    blocked_by = (
        select(TaskDependency.task_id).join(Task, Task.id == TaskDependency.depends_on_task_id).where(Task.status != "done")
    )
    stmt = (
        select(Task)
        .where(Task.assigned_agent_id == agent_id, Task.status == "pending", Task.id.notin_(blocked_by))
        .order_by(Task.priority, Task.created_at)
        .limit(1)
    )
    return (await db.execute(stmt)).scalars().first()


async def waiting_dependencies(db: AsyncSession, task_id: uuid.UUID) -> bool:
    stmt = (
        select(func.count())
        .select_from(TaskDependency)
        .join(Task, Task.id == TaskDependency.depends_on_task_id)
        .where(TaskDependency.task_id == task_id, Task.status != "done")
    )
    return (await db.execute(stmt)).scalar_one() > 0


async def by_status(db: AsyncSession, company_id: uuid.UUID, statuses: list[str]) -> list[Task]:
    stmt = select(Task).where(Task.company_id == company_id, Task.status.in_(statuses))
    return list((await db.execute(stmt)).scalars())


async def stuck_everywhere(db: AsyncSession) -> list[Task]:
    """Tareas que un reinicio dejó a medias (RNF-FIA-01)."""
    return list((await db.execute(select(Task).where(Task.status.in_(["in_progress", "in_review"])))).scalars())


async def duplicate_delegation(db: AsyncSession, parent_id: uuid.UUID, agent_id: uuid.UUID, text: str) -> bool:
    stmt = select(func.count()).select_from(Task).where(
        Task.parent_task_id == parent_id, Task.assigned_agent_id == agent_id, Task.instructions == text
    )  # fmt: skip
    return (await db.execute(stmt)).scalar_one() > 0


async def recurring_done(db: AsyncSession, company_id: uuid.UUID) -> list[Task]:
    stmt = select(Task).where(Task.company_id == company_id, Task.recurrence != "", Task.status == "done")
    return list((await db.execute(stmt)).scalars())


async def agent_stats(db: AsyncSession, agent_id: uuid.UUID) -> dict[str, Any]:
    stmt = select(Task).where(Task.assigned_agent_id == agent_id)
    tasks = list((await db.execute(stmt)).scalars())
    done = [t for t in tasks if t.status == "done"]
    first_time = [t for t in done if t.rejections == 0]
    durations = [(t.updated_at - t.created_at).total_seconds() for t in done]
    return {
        "completed": len(done),
        "failed": sum(1 for t in tasks if t.status == "failed"),
        "accepted_first_pct": round(100 * len(first_time) / len(done), 1) if done else None,
        "avg_seconds": round(sum(durations) / len(durations), 1) if durations else None,
        "avg_steps": round(sum(t.steps_used for t in done) / len(done), 1) if done else None,
    }


# Objetivos
async def create_goal(
    db: AsyncSession, company_id: uuid.UUID, title: str, description: str, due_at: datetime | None
) -> Goal:
    goal = Goal(company_id=company_id, title=title, description=description, due_at=due_at)
    db.add(goal)
    await db.flush()
    await audit_service.record(db, company_id, "owner", "goal.created", str(goal.id), {"title": title})
    await emit(db, "goal.updated", row(goal))
    return goal


async def get_goal(db: AsyncSession, company_id: uuid.UUID, goal_id: uuid.UUID) -> Goal:
    goal = await db.get(Goal, goal_id)
    if goal is None or goal.company_id != company_id:
        raise NotFound("Objetivo")
    return goal


async def get_goal_any(db: AsyncSession, goal_id: uuid.UUID) -> Goal:
    goal = await db.get(Goal, goal_id)
    if goal is None:
        raise NotFound("Objetivo")
    return goal


async def list_goals(db: AsyncSession, company_id: uuid.UUID) -> list[Goal]:
    stmt = select(Goal).where(Goal.company_id == company_id).order_by(Goal.created_at.desc())
    return list((await db.execute(stmt)).scalars())


async def set_goal_status(db: AsyncSession, goal: Goal, status: str) -> None:
    goal.status = status
    await db.flush()
    await audit_service.record(db, goal.company_id, "system", f"goal.{status}", str(goal.id), {})
    await emit(db, "goal.updated", row(goal))


async def goal_tasks(db: AsyncSession, goal_id: uuid.UUID) -> list[Task]:
    stmt = select(Task).where(Task.goal_id == goal_id).order_by(Task.created_at)
    return list((await db.execute(stmt)).scalars())


async def goal_tree(db: AsyncSession, goal: Goal) -> dict[str, Any]:
    tasks = await goal_tasks(db, goal.id)
    nodes = {t.id: {**row(t, *PUBLIC_EXCLUDE), "children": []} for t in tasks}
    roots: list[dict[str, Any]] = []
    for task in tasks:
        parent = nodes.get(task.parent_task_id) if task.parent_task_id else None
        (parent["children"] if parent else roots).append(nodes[task.id])
    return {**row(goal), "tasks": roots}


def validate_transition(status: str) -> None:
    if status not in {*OPEN, "done", "failed", "cancelled"}:
        raise AppError("invalid_status", "Estado de tarea no válido", 422)


async def search(db: AsyncSession, company_id: uuid.UUID, query: str) -> list[dict[str, Any]]:
    pattern = f"%{query}%"
    stmt = select(Task).where(Task.company_id == company_id, Task.title.ilike(pattern) | Task.result_text.ilike(pattern))
    return [row(t, *PUBLIC_EXCLUDE) for t in (await db.execute(stmt.limit(20))).scalars()]


# Reuniones
async def create_meeting(
    db: AsyncSession, company_id: uuid.UUID, topic: str, participants: list[uuid.UUID], max_rounds: int
) -> Meeting:
    meeting = Meeting(company_id=company_id, topic=topic, participants=participants, max_rounds=max_rounds)
    db.add(meeting)
    await db.flush()
    await audit_service.record(db, company_id, "owner", "meeting.created", str(meeting.id), {"topic": topic})
    return meeting


async def get_meeting(db: AsyncSession, meeting_id: uuid.UUID) -> Meeting | None:
    return await db.get(Meeting, meeting_id)


async def list_meetings(db: AsyncSession, company_id: uuid.UUID) -> list[Meeting]:
    stmt = select(Meeting).where(Meeting.company_id == company_id).order_by(Meeting.created_at.desc())
    return list((await db.execute(stmt)).scalars())
