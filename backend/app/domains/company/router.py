from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentOwner
from app.core.db import get_db
from app.core.util import row
from app.domains.company import service
from app.domains.company.service import CompanyDep
from app.domains.finance import service as finance_service
from app.domains.runtime import service as runtime_service

router = APIRouter(prefix="/company", tags=["company"])
Db = Annotated[AsyncSession, Depends(get_db)]


class CompanyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    mission: str = ""
    sector: str = ""
    locale: str = "es"
    timezone: str = "Europe/Madrid"
    template: str | None = "default"


class CompanyPatch(BaseModel):
    name: str | None = None
    mission: str | None = None
    values: str | None = None
    sector: str | None = None
    locale: str | None = None
    timezone: str | None = None
    daily_budget_eur: Decimal | None = Field(default=None, ge=0)
    monthly_budget_eur: Decimal | None = Field(default=None, ge=0)


class AiSettings(BaseModel):
    powerful_model: str | None = None
    fast_model: str | None = None
    embeddings_provider: str | None = None
    embedding_model: str | None = None


@router.get("/exists")
async def exists(owner: CurrentOwner, db: Db) -> dict[str, Any]:
    return {"exists": await service.company_of(db, owner.id) is not None, "templates": service.list_templates()}


@router.post("", status_code=201)
async def create(body: CompanyIn, owner: CurrentOwner, db: Db) -> dict[str, Any]:
    fields = body.model_dump(exclude={"template"})
    return row(await service.create(db, owner.id, fields, body.template))


@router.get("")
async def get(company: CompanyDep, db: Db) -> dict[str, Any]:
    return await service.snapshot(db, company)


@router.patch("")
async def patch(body: CompanyPatch, company: CompanyDep, db: Db) -> dict[str, Any]:
    return row(await service.update(db, company, body.model_dump(exclude_unset=True)), "ai_settings")


@router.post("/pause")
async def pause(company: CompanyDep, db: Db) -> dict[str, str]:
    await service.set_paused(db, company, True)
    return {"status": company.status}


@router.post("/resume")
async def resume(company: CompanyDep, db: Db) -> dict[str, str]:
    await service.set_paused(db, company, False)
    return {"status": company.status}


@router.get("/status-bar")
async def status_bar(company: CompanyDep, db: Db) -> dict[str, Any]:
    return await runtime_service.status_bar(db, company)


@router.get("/ai")
async def ai_settings(company: CompanyDep) -> dict[str, Any]:
    return await runtime_service.ai_overview(company)


@router.patch("/ai")
async def patch_ai(body: AiSettings, company: CompanyDep, db: Db) -> dict[str, Any]:
    await runtime_service.update_ai(db, company, body.model_dump(exclude_unset=True))
    return await runtime_service.ai_overview(company)


@router.get("/spend")
async def spend(company: CompanyDep, db: Db) -> dict[str, Any]:
    now = datetime.now().date()
    return {"today_eur": await finance_service.spend_on(db, company.id, now)}
