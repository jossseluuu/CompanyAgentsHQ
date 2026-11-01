import uuid
from pathlib import Path
from typing import Annotated, Any

import yaml
from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentOwner
from app.core.config import BACKEND_DIR
from app.core.db import Db
from app.core.errors import AppError
from app.core.events import emit
from app.core.util import row, rows
from app.domains.agents import service as agents_service
from app.domains.audit import service as audit_service
from app.domains.company.models import Company, Department
from app.domains.knowledge import service as knowledge_service
from app.domains.office import service as office_service
from app.domains.runtime import service as runtime_service

TEMPLATES = BACKEND_DIR / "seeds" / "templates"


def list_templates() -> list[str]:
    return sorted(p.stem for p in TEMPLATES.glob("*.yaml"))


def _load_template(name: str) -> dict[str, Any]:
    path = TEMPLATES / f"{Path(name).name}.yaml"
    if not path.exists():
        raise AppError("unknown_template", "Esa plantilla no existe", 404)
    data: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data


async def company_of(db: AsyncSession, owner_id: uuid.UUID) -> Company | None:
    stmt = select(Company).where(Company.owner_id == owner_id)
    return (await db.execute(stmt)).scalars().first()


async def require_company(owner: CurrentOwner, db: Db) -> Company:
    company = await company_of(db, owner.id)
    if company is None:
        raise AppError("no_company", "Crea primero la empresa", 409)
    return company


CompanyDep = Annotated[Company, Depends(require_company)]


async def get(db: AsyncSession, company_id: uuid.UUID) -> Company:
    company = await db.get(Company, company_id)
    assert company is not None
    return company


async def create(db: AsyncSession, owner_id: uuid.UUID, fields: dict[str, Any], template: str | None) -> Company:
    if await company_of(db, owner_id) is not None:
        raise AppError("company_exists", "Ya tienes una empresa", 409)
    company = Company(owner_id=owner_id, **fields)
    db.add(company)
    await db.flush()
    await knowledge_service.ensure_base(db, company.id, "company", None, "Conocimiento de empresa")
    if template:
        await _apply_template(db, company, _load_template(template))
    await audit_service.record(db, company.id, "owner", "company.created", str(company.id), {"template": template})
    return company


async def _apply_template(db: AsyncSession, company: Company, template: dict[str, Any]) -> None:
    departments: dict[str, Department] = {}
    for spec in template["departments"]:
        department = Department(company_id=company.id, name=spec["name"], color=spec["color"])
        db.add(department)
        departments[spec["name"]] = department
    await db.flush()
    for department in departments.values():
        await knowledge_service.ensure_base(
            db, company.id, "department", department.id, f"Conocimiento de {department.name}"
        )

    rooms = {}
    for spec in template["rooms"]:
        x, y = spec["x"], spec["y"]
        room = await office_service.create_room(
            db,
            company.id,
            name=spec["name"],
            slug=spec["slug"],
            grid_x=x,
            grid_y=y,
            width=spec["w"],
            height=spec["h"],
            color=spec["color"],
            doors=[[x + dx, y + dy] for dx, dy in spec["doors"]],
            restricted=spec.get("restricted", False),
        )
        rooms[spec["slug"]] = (room, spec)

    agents: dict[str, Any] = {}
    for spec in template["agents"]:
        room, room_spec = rooms[spec["room"]]
        dx, dy = spec["desk"]
        agents[spec["key"]] = await agents_service.create(
            db,
            company.id,
            name=spec["name"],
            role=spec["key"],
            department_id=departments[spec["department"]].id,
            home_room_id=room.id,
            manager_id=agents[spec["manager"]].id if spec.get("manager") else None,
            model=spec["model"],
            tools=spec["tools"],
            daily_budget_eur=spec.get("budget", 0.5),
            seat=(room.grid_x + dx, room.grid_y + dy + 1),
        )
    for spec in template["agents"]:
        agent = agents[spec["key"]]
        for department in departments.values():
            if department.name == spec["department"] and spec.get("head"):
                department.head_agent_id = agent.id
        for sup in spec.get("supervised_by", []):
            await agents_service.add_supervision(
                db, agents[sup["agent"]].id, agent.id, sup["kind"], sup.get("tools", []), sup.get("escalate_after_min")
            )
        if spec.get("supervises_all"):
            for other in agents.values():
                if other.id != agent.id:
                    await agents_service.add_supervision(db, agent.id, other.id, "observer")

    for room, spec in rooms.values():
        for key in spec["modules"]:
            await office_service.install_module(db, room, key)
        desks = [a for a in template["agents"] if a["room"] == spec["slug"]]
        team = await office_service.install_module(db, room, "team")
        for desk in desks:
            await office_service.add_furniture(
                db, room, team, "desk", room.grid_x + desk["desk"][0], room.grid_y + desk["desk"][1], 0, True
            )
        await knowledge_service.ensure_base(db, company.id, "room", room.id, f"Conocimiento de {room.name}")

    for agent in agents.values():
        await knowledge_service.grant_inherited(db, agent)


async def place_role(db: AsyncSession, company_id: uuid.UUID, role: str) -> dict[str, uuid.UUID]:
    """Lleva un cargo del catálogo a la sala y el departamento de su área, creándolos si aún no existen."""
    group = next((g for g in agents_service.role_catalog()["groups"] if any(r["key"] == role for r in g["roles"])), None)
    if group is None:
        return {}
    area = group["area"]
    stmt = select(Department).where(
        Department.company_id == company_id, Department.name == area["department"]
    )
    department = (await db.execute(stmt)).scalars().first()
    if department is None:
        department = Department(company_id=company_id, name=area["department"], color=area.get("color", "#64748b"))
        db.add(department)
        await db.flush()
        name = f"Conocimiento de {department.name}"
        await knowledge_service.ensure_base(db, company_id, "department", department.id, name)
    room = await office_service.room_by_slug(db, company_id, area["room"])
    if room is None and "new_room" in area:
        spec = area["new_room"]
        room = await office_service.create_room(
            db,
            company_id,
            name=spec["name"],
            slug=area["room"],
            grid_x=spec["x"],
            grid_y=spec["y"],
            width=spec["w"],
            height=spec["h"],
            color=spec["color"],
            doors=[[spec["x"] + spec["door"][0], spec["y"] + spec["door"][1]]],
        )
        for key in ("filing_cabinet", "task_board", "knowledge_base", "team"):
            await office_service.install_module(db, room, key)
        await knowledge_service.ensure_base(db, company_id, "room", room.id, f"Conocimiento de {room.name}")
    return {"department_id": department.id, **({"home_room_id": room.id} if room else {})}


async def update(db: AsyncSession, company: Company, fields: dict[str, Any]) -> Company:
    for key, value in fields.items():
        setattr(company, key, value)
    await db.flush()
    await audit_service.record(db, company.id, "owner", "company.updated", str(company.id), {"fields": list(fields)})
    await emit(db, "company.updated", row(company, "ai_settings"))
    return company


async def set_paused(db: AsyncSession, company: Company, paused: bool) -> Company:
    company.status = "paused" if paused else "active"
    await audit_service.record(db, company.id, "owner", "company.paused" if paused else "company.resumed", "", {})
    await emit(db, "company.paused", {"paused": paused})
    await db.flush()
    if not paused:
        await runtime_service.resume_company(db, company.id)
    return company


async def snapshot(db: AsyncSession, company: Company) -> dict[str, Any]:
    """Carga inicial de la oficina."""
    data = row(company)
    data["ai_settings"] = runtime_service.public_ai_settings(company)
    departments = (await db.execute(select(Department).where(Department.company_id == company.id))).scalars()
    data["departments"] = rows(departments)
    data["office"] = await office_service.office_map(db, company.id)
    data["agents"] = await agents_service.summaries(db, company.id)
    return data


async def departments(db: AsyncSession, company_id: uuid.UUID) -> list[Department]:
    return list((await db.execute(select(Department).where(Department.company_id == company_id))).scalars())
