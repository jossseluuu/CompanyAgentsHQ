import csv
import io
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.events import emit
from app.core.util import rows
from app.domains.agents import service as agents_service
from app.domains.audit import service as audit_service
from app.domains.finance.models import Budget, FinanceEntry


def _day_start(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=UTC)


async def spend_on(db: AsyncSession, company_id: uuid.UUID, day: date) -> float:
    start = _day_start(day)
    return float(await audit_service.spend(db, company_id, since=start, until=start + timedelta(days=1)))


async def _today(db: AsyncSession, company_id: uuid.UUID, agent_id: uuid.UUID | None = None) -> Decimal:
    start = _day_start(datetime.now(UTC).date())
    return await audit_service.spend(db, company_id, agent_id=agent_id, since=start)


async def _limits(db: AsyncSession, company_id: uuid.UUID) -> tuple[Decimal, Decimal, uuid.UUID]:
    found = await db.execute(
        text("select daily_budget_eur, monthly_budget_eur, owner_id from companies where id = :id"), {"id": company_id}
    )
    daily, monthly, owner = found.one()
    return Decimal(daily), Decimal(monthly), owner


async def budget_block(db: AsyncSession, company_id: uuid.UUID, agent: Any) -> str | None:
    """Motivo por el que el agente no puede gastar más hoy (RNF-COS-01)."""
    daily, monthly, _ = await _limits(db, company_id)
    if await _today(db, company_id) >= daily:
        return "Límite diario de la empresa alcanzado"
    today = datetime.now(UTC).date()
    month_start = _day_start(today.replace(day=1))
    if await audit_service.spend(db, company_id, since=month_start) >= monthly:
        return "Límite mensual de la empresa alcanzado"
    if agent is not None and await _today(db, company_id, agent.id) >= agent.daily_budget_eur:
        return "Límite diario del agente alcanzado"
    return None


async def after_cost(db: AsyncSession, company_id: uuid.UUID) -> None:
    """Actualiza el indicador y avisa al cruzar el 80 % y el 100 % (RF-FIN-06)."""
    daily, _, owner = await _limits(db, company_id)
    today = await _today(db, company_id)
    await emit(db, "cost.updated", {"today_eur": today, "limit_eur": daily})
    if daily <= 0:
        return
    ratio = today / daily
    for threshold, kind in ((Decimal(1), "budget_100"), (Decimal("0.8"), "budget_80")):
        if ratio >= threshold:
            if not await audit_service.notified_today(db, owner, kind):
                percent = int(threshold * 100)
                await audit_service.notify(db, company_id, kind, f"Gasto de IA al {percent} % del límite diario", "/finance")
            break


def _parse_amount(raw: str) -> Decimal:
    value = raw.strip().replace("€", "").replace(" ", "")
    if "," in value and "." in value:
        value = value.replace(".", "").replace(",", ".")
    else:
        value = value.replace(",", ".")
    return Decimal(value)


async def import_csv(db: AsyncSession, company_id: uuid.UUID, data: bytes, source: str) -> int:
    """Columnas: fecha, categoria, importe y tipo (ingreso/gasto); un importe negativo cuenta como gasto."""
    content = data.decode("utf-8-sig", errors="replace")
    delimiter = ";" if content.split("\n", 1)[0].count(";") > content.split("\n", 1)[0].count(",") else ","
    reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)
    count = 0
    for line, record in enumerate(reader, start=2):
        fields = {(k or "").strip().lower(): (v or "").strip() for k, v in record.items()}
        try:
            when = date.fromisoformat(fields.get("fecha") or fields["date"])
            amount = _parse_amount(fields.get("importe") or fields["amount"])
        except (KeyError, ValueError, InvalidOperation):
            raise AppError("invalid_csv", f"Fila {line}: se esperan fecha (AAAA-MM-DD) e importe", 422) from None
        declared = (fields.get("tipo") or fields.get("kind") or "").lower()
        kind = "income" if declared in {"ingreso", "income"} or (not declared and amount > 0) else "expense"
        db.add(
            FinanceEntry(
                company_id=company_id, date=when, category=fields.get("categoria") or fields.get("category") or "General",
                amount_eur=abs(amount), kind=kind, source=source,
            )
        )  # fmt: skip
        count += 1
    await db.flush()
    await audit_service.record(db, company_id, "owner", "finance.imported", source, {"rows": count})
    await emit(db, "module.updated", {"module_key": "finance_dashboard"})
    return count


async def entries(db: AsyncSession, company_id: uuid.UUID, since: date | None = None) -> list[FinanceEntry]:
    stmt = select(FinanceEntry).where(FinanceEntry.company_id == company_id)
    if since:
        stmt = stmt.where(FinanceEntry.date >= since)
    return list((await db.execute(stmt.order_by(FinanceEntry.date.desc()))).scalars())


async def add_budget(
    db: AsyncSession, company_id: uuid.UUID, category: str, period: str, amount: Decimal,
    agent_id: uuid.UUID | None = None,
) -> Budget:  # fmt: skip
    budget = Budget(company_id=company_id, category=category, period=period, amount_eur=amount,
                    created_by_agent_id=agent_id)  # fmt: skip
    db.add(budget)
    await db.flush()
    await audit_service.record(
        db, company_id, str(agent_id or "owner"), "finance.budget_created", category, {"period": period, "amount": amount}
    )
    await emit(db, "module.updated", {"module_key": "finance_dashboard"})
    return budget


async def budgets(db: AsyncSession, company_id: uuid.UUID, period: str | None = None) -> list[Budget]:
    stmt = select(Budget).where(Budget.company_id == company_id)
    if period:
        stmt = stmt.where(Budget.period == period)
    return list((await db.execute(stmt)).scalars())


async def dashboard(db: AsyncSession, company_id: uuid.UUID, period: str = "month") -> dict[str, Any]:
    today = datetime.now(UTC).date()
    since = today.replace(day=1) if period == "month" else today - timedelta(days=30)
    agents = await agents_service.list_active(db, company_id)
    by_id = {a.id: a for a in agents}
    by_agent = await audit_service.spend_by_agent(db, company_id, since)
    by_department: dict[str, float] = {}
    for agent_id, cost in by_agent.items():
        agent = by_id.get(agent_id)
        key = str(agent.department_id) if agent and agent.department_id else "sin_departamento"
        by_department[key] = by_department.get(key, 0.0) + float(cost)

    items = await entries(db, company_id, since)
    income = sum((e.amount_eur for e in items if e.kind == "income"), Decimal(0))
    expense = sum((e.amount_eur for e in items if e.kind == "expense"), Decimal(0))
    real_by_category: dict[str, Decimal] = {}
    for item in items:
        if item.kind == "expense":
            real_by_category[item.category] = real_by_category.get(item.category, Decimal(0)) + item.amount_eur
    ai_month = sum(by_agent.values(), Decimal(0))
    real_by_category["IA"] = real_by_category.get("IA", Decimal(0)) + ai_month

    month = today.strftime("%Y-%m")
    planned = await budgets(db, company_id, month)
    comparison = [
        {"category": b.category, "budget_eur": float(b.amount_eur),
         "real_eur": float(real_by_category.get(b.category, Decimal(0)))}
        for b in planned
    ]  # fmt: skip
    days_in_month = ((today.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)).day
    _, monthly, _ = await _limits(db, company_id)
    return {
        "period": period,
        "income_eur": float(income),
        "expense_eur": float(expense),
        "ai_eur": float(ai_month),
        "ai_by_day": await audit_service.spend_by_day(db, company_id, since),
        "ai_by_agent": [
            {"agent_id": k, "name": by_id[k].name if k in by_id else "Archivado", "cost_eur": float(v)}
            for k, v in by_agent.items()
        ],
        "ai_by_department": by_department,
        "budget_vs_real": comparison,
        "forecast_eur": float(ai_month / today.day * days_in_month),
        "monthly_limit_eur": float(monthly),
        "recent": rows(items[:20]),
    }


async def summary_text(db: AsyncSession, company_id: uuid.UUID) -> str:
    """Resumen que el dashboard publica en la base de conocimiento de su sala (RF-CON-05)."""
    data = await dashboard(db, company_id)
    lines = [
        f"Resumen financiero a {datetime.now(UTC).date().isoformat()}.",
        f"Ingresos del mes: {data['income_eur']:.2f} €.",
        f"Gastos del mes: {data['expense_eur']:.2f} €.",
        f"Gasto de IA del mes: {data['ai_eur']:.2f} €.",
    ]
    lines += [
        f"Presupuesto {c['category']}: {c['budget_eur']:.2f} €, real {c['real_eur']:.2f} €." for c in data["budget_vs_real"]
    ]
    return "\n".join(lines)
