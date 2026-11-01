from typing import Any

from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.finance import service as finance_service


async def run(ctx: ToolContext, _: dict[str, Any]) -> ToolResult:
    return ToolResult(await finance_service.summary_text(ctx.db, ctx.company_id))


tool = Tool(
    name="read_finance",
    description="Lee ingresos, gastos, gasto de IA y presupuestos del mes.",
    input_schema={"type": "object", "properties": {}},
    run=run,
)
