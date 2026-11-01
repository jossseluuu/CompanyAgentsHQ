from decimal import Decimal, InvalidOperation
from typing import Any

from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.finance import service as finance_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    try:
        amount = Decimal(str(args["amount_eur"]))
    except InvalidOperation:
        return ToolResult("Importe no válido.", is_error=True)
    await finance_service.add_budget(ctx.db, ctx.company_id, args["category"], args["period"], amount, ctx.agent.id)
    return ToolResult(f"Presupuesto de {args['category']} para {args['period']} guardado.")


tool = Tool(
    name="create_budget",
    description="Guarda un presupuesto por partida. period usa el formato AAAA-MM.",
    input_schema={
        "type": "object",
        "properties": {
            "category": {"type": "string"},
            "period": {"type": "string"},
            "amount_eur": {"type": "number"},
        },
        "required": ["category", "period", "amount_eur"],
    },
    run=run,
)
