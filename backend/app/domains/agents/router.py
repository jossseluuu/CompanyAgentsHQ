import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.db import Db
from app.core.errors import AppError
from app.core.util import row, rows
from app.domains.agents import service
from app.domains.company import service as company_service
from app.domains.company.service import CompanyDep
from app.domains.office import service as office_service
from app.domains.runtime import service as runtime_service

router = APIRouter(tags=["agents"])


class AgentIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=60)
    avatar: str = "default"
    department_id: uuid.UUID | None = None
    home_room_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    model: str = "fast"
    temperature: float = Field(default=0.3, ge=0, le=1)
    tools: list[str] = []
    daily_budget_eur: Decimal = Field(default=Decimal("0.5"), ge=0)
    seat_x: int = 0
    seat_y: int = 0
    system_prompt: str | None = None


class AgentPatch(BaseModel):
    name: str | None = None
    avatar: str | None = None
    personality: str | None = None
    department_id: uuid.UUID | None = None
    home_room_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=1)
    tools: list[str] | None = None
    daily_budget_eur: Decimal | None = Field(default=None, ge=0)


class PromptIn(BaseModel):
    system_prompt: str | None = None
    note: str = ""
    restore_version: int | None = None


class SupervisionIn(BaseModel):
    supervisor_id: uuid.UUID
    supervised_id: uuid.UUID
    kind: str
    tools: list[str] = []
    escalate_after_min: int | None = None


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=20000)


class MemoryPatch(BaseModel):
    summary: str = Field(min_length=1)


@router.get("/role-catalog")
async def role_catalog(company: CompanyDep) -> dict[str, Any]:
    return service.role_catalog()


@router.get("/agents")
async def list_agents(company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    return await service.summaries(db, company.id)


@router.post("/agents", status_code=201)
async def create_agent(body: AgentIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    fields = body.model_dump(exclude={"seat_x", "seat_y", "name", "role"})
    if not body.home_room_id:
        fields.update(await company_service.place_role(db, company.id, body.role))
    agent = await service.create(db, company.id, name=body.name, role=body.role, seat=(body.seat_x, body.seat_y), **fields)
    await runtime_service.agent_hired(db, agent)
    return row(agent)


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    return row(await service.get(db, company.id, agent_id))


@router.patch("/agents/{agent_id}")
async def patch_agent(agent_id: uuid.UUID, body: AgentPatch, company: CompanyDep, db: Db) -> dict[str, Any]:
    agent = await service.get(db, company.id, agent_id)
    return row(await service.update_agent(db, agent, body.model_dump(exclude_unset=True)))


@router.delete("/agents/{agent_id}", status_code=204)
async def fire(agent_id: uuid.UUID, company: CompanyDep, db: Db) -> None:
    await service.archive(db, await service.get(db, company.id, agent_id))


@router.post("/agents/{agent_id}/clone", status_code=201)
async def clone(agent_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    agent = await service.clone(db, await service.get(db, company.id, agent_id))
    await runtime_service.agent_hired(db, agent)
    return row(agent)


@router.post("/agents/{agent_id}/pause")
async def pause(agent_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, str]:
    agent = await service.get(db, company.id, agent_id)
    await service.pause(db, agent, "Pausado por el dueño", "owner")
    return {"status": agent.status}


@router.post("/agents/{agent_id}/resume")
async def resume(agent_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, str]:
    agent = await service.get(db, company.id, agent_id)
    await runtime_service.resume_agent(db, agent)
    return {"status": agent.status}


@router.post("/agents/{agent_id}/reset")
async def reset(agent_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, str]:
    agent = await service.get(db, company.id, agent_id)
    await runtime_service.reset_agent(db, agent)
    return {"status": agent.status}


@router.get("/agents/{agent_id}/profile")
async def profile(agent_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    return await runtime_service.agent_profile(db, await service.get(db, company.id, agent_id))


@router.get("/agents/{agent_id}/prompt-versions")
async def prompt_versions(agent_id: uuid.UUID, company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    await service.get(db, company.id, agent_id)
    return rows(await service.prompt_versions(db, agent_id))


@router.post("/agents/{agent_id}/prompt-versions", status_code=201)
async def add_prompt(agent_id: uuid.UUID, body: PromptIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    agent = await service.get(db, company.id, agent_id)
    if body.restore_version is not None:
        return row(await service.restore_prompt(db, agent, body.restore_version))
    return row(await service.add_prompt_version(db, agent, body.system_prompt or "", body.note))


@router.get("/agents/{agent_id}/routine")
async def get_routine(agent_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    await service.get(db, company.id, agent_id)
    return {"rules": await service.routine_rules(db, agent_id), **office_service.routine_options()}


@router.put("/agents/{agent_id}/routine")
async def routine(agent_id: uuid.UUID, rules: dict[str, Any], company: CompanyDep, db: Db) -> dict[str, Any]:
    await service.get(db, company.id, agent_id)
    if not set(map(str, rules.values())) <= set(office_service.routine_options()["targets"]):
        raise AppError("unknown_target", "Ese destino de rutina no existe", 422)
    await service.set_routine(db, agent_id, rules)
    return rules


@router.get("/agents/{agent_id}/messages")
async def get_messages(agent_id: uuid.UUID, company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    await service.get(db, company.id, agent_id)
    return rows(await service.messages(db, agent_id))


@router.post("/agents/{agent_id}/messages", status_code=202)
async def send_message(agent_id: uuid.UUID, body: MessageIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    agent = await service.get(db, company.id, agent_id)
    message = await service.add_message(db, agent.id, "owner", body.content)
    await runtime_service.request_chat_reply(db, agent, message.id)
    return row(message)


@router.patch("/agents/{agent_id}/memories/{memory_id}")
async def edit_memory(
    agent_id: uuid.UUID, memory_id: uuid.UUID, body: MemoryPatch, company: CompanyDep, db: Db
) -> dict[str, Any]:
    await service.get(db, company.id, agent_id)
    entry = await service.get_memory(db, agent_id, memory_id)
    entry.summary = body.summary
    return row(entry)


@router.delete("/agents/{agent_id}/memories/{memory_id}", status_code=204)
async def delete_memory(agent_id: uuid.UUID, memory_id: uuid.UUID, company: CompanyDep, db: Db) -> None:
    await service.get(db, company.id, agent_id)
    await service.delete_memories(db, [await service.get_memory(db, agent_id, memory_id)])


@router.get("/org-chart")
async def org_chart(company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    return await service.org_chart(db, company.id)


@router.get("/supervisions")
async def list_supervisions(company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    return rows(await service.supervisions(db, company.id))


@router.post("/supervisions", status_code=201)
async def create_supervision(body: SupervisionIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    await service.get(db, company.id, body.supervisor_id)
    await service.get(db, company.id, body.supervised_id)
    return row(await service.add_supervision(db, **body.model_dump()))


@router.delete("/supervisions/{supervision_id}", status_code=204)
async def delete_supervision(supervision_id: uuid.UUID, _: CompanyDep, db: Db) -> None:
    await service.remove_supervision(db, supervision_id)
