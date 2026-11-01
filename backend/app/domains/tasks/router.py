import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.util import row, rows
from app.domains.approvals import service as approvals_service
from app.domains.company.service import CompanyDep
from app.domains.office import service as office_service
from app.domains.runtime import service as runtime_service
from app.domains.tasks import service
from app.domains.tasks.service import PUBLIC_EXCLUDE

router = APIRouter(tags=["tasks"])
Db = Annotated[AsyncSession, Depends(get_db)]


class GoalIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    due_at: datetime | None = None


class PlanDecision(BaseModel):
    plan: dict[str, Any] | None = None


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    instructions: str = ""
    agent_id: uuid.UUID
    room_id: uuid.UUID | None = None
    priority: int = Field(default=2, ge=1, le=3)
    due_at: datetime | None = None
    recurrence: str = ""
    depends_on: list[uuid.UUID] = []


class TaskPatch(BaseModel):
    status: str | None = None
    assigned_agent_id: uuid.UUID | None = None
    priority: int | None = Field(default=None, ge=1, le=3)
    due_at: datetime | None = None
    title: str | None = None
    instructions: str | None = None


class Decision(BaseModel):
    approve: bool
    comment: str = ""


class MeetingIn(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    participants: list[uuid.UUID] = Field(min_length=2)
    max_rounds: int = Field(default=2, ge=1, le=5)


@router.get("/goals")
async def goals(company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    return rows(await service.list_goals(db, company.id))


@router.post("/goals", status_code=201)
async def create_goal(body: GoalIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    goal = await service.create_goal(db, company.id, body.title, body.description, body.due_at)
    await runtime_service.request_plan(db, goal)
    return row(goal)


@router.get("/goals/{goal_id}")
async def goal(goal_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    return await service.goal_tree(db, await service.get_goal(db, company.id, goal_id))


@router.post("/goals/{goal_id}/approve-plan")
async def approve_plan(goal_id: uuid.UUID, body: PlanDecision, company: CompanyDep, db: Db) -> dict[str, Any]:
    target = await service.get_goal(db, company.id, goal_id)
    await runtime_service.approve_plan(db, target, body.plan)
    return row(target)


@router.post("/goals/{goal_id}/reject-plan")
async def reject_plan(goal_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    target = await service.get_goal(db, company.id, goal_id)
    await service.set_goal_status(db, target, "rejected")
    return row(target)


@router.get("/rooms/{room_id}/tasks")
async def room_board(room_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    await office_service.get_room(db, company.id, room_id)
    return await service.board(db, room_id)


@router.get("/tasks")
async def tasks(company: CompanyDep, db: Db, agent: uuid.UUID | None = None) -> list[dict[str, Any]]:
    return rows(await service.list_tasks(db, company.id, agent), *PUBLIC_EXCLUDE)


@router.post("/tasks", status_code=201)
async def create_task(body: TaskIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    task = await runtime_service.create_owner_task(db, company.id, body.model_dump())
    return row(task, *PUBLIC_EXCLUDE)


@router.get("/tasks/{task_id}")
async def get_task(task_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    return row(await service.get_task(db, company.id, task_id), *PUBLIC_EXCLUDE)


@router.patch("/tasks/{task_id}")
async def patch_task(task_id: uuid.UUID, body: TaskPatch, company: CompanyDep, db: Db) -> dict[str, Any]:
    fields = body.model_dump(exclude_unset=True)
    if "status" in fields:
        service.validate_transition(fields["status"])
    task = await service.patch(db, await service.get_task(db, company.id, task_id), fields)
    return row(task, *PUBLIC_EXCLUDE)


@router.post("/tasks/{task_id}/retry")
async def retry(task_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    task = await service.get_task(db, company.id, task_id)
    await runtime_service.retry_task(db, task)
    return row(task, *PUBLIC_EXCLUDE)


@router.post("/tasks/{task_id}/cancel")
async def cancel(task_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    task = await service.get_task(db, company.id, task_id)
    await runtime_service.cancel_task(db, task)
    return row(task, *PUBLIC_EXCLUDE)


@router.get("/approvals")
async def approvals(company: CompanyDep, db: Db, status: str | None = None) -> list[dict[str, Any]]:
    return await runtime_service.approvals_with_context(db, company.id, status)


@router.post("/approvals/{approval_id}/decision")
async def decision(approval_id: uuid.UUID, body: Decision, company: CompanyDep, db: Db) -> dict[str, Any]:
    approval = await approvals_service.get(db, company.id, approval_id)
    await runtime_service.apply_decision(db, approval, body.approve, body.comment, "owner")
    return row(approval)


@router.get("/meetings")
async def meetings(company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    return rows(await service.list_meetings(db, company.id))


@router.post("/meetings", status_code=201)
async def create_meeting(body: MeetingIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    meeting = await service.create_meeting(db, company.id, body.topic, body.participants, body.max_rounds)
    await runtime_service.request_meeting(db, meeting)
    return row(meeting)
