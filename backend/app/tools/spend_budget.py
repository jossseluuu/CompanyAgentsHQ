from decimal import Decimal
from typing import Any

from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.audit import service as audit_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    amount = Decimal(str(args["amount_eur"]))
    ctx.agent.daily_budget_eur += amount
    await audit_service.record(
        ctx.db, ctx.company_id, str(ctx.agent.id), "budget.extended", str(ctx.agent.id),
        {"amount": amount, "reason": args["reason"]},
    )  # fmt: skip
    return ToolResult(f"Presupuesto ampliado en {amount} €.")


tool = Tool(
    name="spend_budget",
    description="Pide gasto extra por encima de tu presupuesto diario. Requiere aprobación del dueño.",
    input_schema={
        "type": "object",
        "properties": {"amount_eur": {"type": "number"}, "reason": {"type": "string"}},
        "required": ["amount_eur", "reason"],
    },
    run=run,
    sensitive=True,
    core=True,
)
