"""Ficha completa del agente (sección 5.6): reúne datos de cada dominio."""

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.util import row, rows
from app.domains.agents import service as agents_service
from app.domains.approvals import service as approvals_service
from app.domains.audit import service as audit_service
from app.domains.knowledge import service as knowledge_service
from app.domains.runtime import context
from app.domains.tasks import service as tasks_service


async def build(db: AsyncSession, agent: Any) -> dict[str, Any]:
    since = datetime.now(UTC).date() - timedelta(days=30)
    tasks = await tasks_service.list_tasks(db, agent.company_id, agent.id)
    public = [row(t, *tasks_service.PUBLIC_EXCLUDE) for t in tasks]
    enabled = await context.allowed_tools(db, agent)
    return {
        "agent": row(agent),
        "profile": {
            "prompt": row(await agents_service.current_prompt(db, agent.id)),
            "manager_id": agent.manager_id,
            "reports": rows(await agents_service.subordinates(db, agent.id), "tools"),
        },
        "capabilities": {
            "tools": agent.tools,
            "usable_now": sorted(enabled),
            "supervised_by": rows(await agents_service.supervisors_of(db, agent.id, "review"))
            + rows(await agents_service.supervisors_of(db, agent.id, "pre_approval"))
            + rows(await agents_service.supervisors_of(db, agent.id, "observer")),
        },
        "knowledge": await knowledge_service.permissions(db, agent.id),
        "work": {
            "current": next((t for t in public if t["id"] == agent.current_task_id), None),
            "queue": [t for t in public if t["status"] in {"pending", "blocked", "in_review"}],
            "finished": [t for t in public if t["status"] in {"done", "failed", "cancelled"}],
        },
        "performance": await tasks_service.agent_stats(db, agent.id),
        "cost": {
            "by_day": await audit_service.spend_by_day(db, agent.company_id, since, agent.id),
            "by_task": await audit_service.spend_by_task(db, agent.id),
            "tokens": await audit_service.token_totals(db, agent.id),
            "today_eur": float(
                await audit_service.spend(
                    db, agent.company_id, agent_id=agent.id, since=datetime.now(UTC).replace(hour=0, minute=0, second=0)
                )
            ),
            "budget_eur": float(agent.daily_budget_eur),
        },
        "memory": await agents_service.memories_dicts(db, agent.id),
        "audit": {
            "traces": rows(await audit_service.agent_traces(db, agent.id), "context"),
            "anomalies": rows(await audit_service.anomalies(db, agent.company_id, agent_id=agent.id)),
            "approvals": [
                row(a) for a in await approvals_service.listing(db, agent.company_id, None)
                if a.requester_agent_id == agent.id
            ],
        },
    }
