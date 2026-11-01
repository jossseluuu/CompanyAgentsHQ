from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.util import row, rows
from app.domains.audit import service as audit_service
from app.domains.company.service import CompanyDep
from app.domains.finance import service

router = APIRouter(tags=["finance"])
Db = Annotated[AsyncSession, Depends(get_db)]


class BudgetIn(BaseModel):
    category: str = Field(min_length=1, max_length=120)
    period: str = Field(pattern=r"^\d{4}-\d{2}$")
    amount_eur: Decimal = Field(ge=0)


@router.get("/finance/dashboard")
async def dashboard(company: CompanyDep, db: Db, period: str = "month") -> dict[str, Any]:
    return await service.dashboard(db, company.id, period)


@router.post("/finance/entries/import", status_code=201)
async def import_entries(file: UploadFile, company: CompanyDep, db: Db) -> dict[str, int]:
    return {"imported": await service.import_csv(db, company.id, await file.read(), file.filename or "csv")}


@router.get("/finance/budgets")
async def budgets(company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    return rows(await service.budgets(db, company.id))


@router.post("/finance/budgets", status_code=201)
async def add_budget(body: BudgetIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    return row(await service.add_budget(db, company.id, body.category, body.period, body.amount_eur))


@router.get("/finance/export")
async def export(company: CompanyDep, db: Db) -> Response:
    data = await service.dashboard(db, company.id)
    lines = ["fecha,categoria,importe_eur,tipo"]
    lines += [f"{e['date']},{e['category']},{e['amount_eur']},{e['kind']}" for e in data["recent"]]
    return Response("\n".join(lines), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=finanzas.csv"})  # fmt: skip


@router.get("/costs")
async def costs(company: CompanyDep, db: Db, group_by: str = "agent") -> Any:
    since = datetime.now(UTC).date().replace(day=1)
    if group_by == "day":
        return await audit_service.spend_by_day(db, company.id, since)
    data = await service.dashboard(db, company.id)
    return data["ai_by_department"] if group_by == "department" else data["ai_by_agent"]
