from typing import Any

from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.audit import service as audit_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    events = await audit_service.list_events(ctx.db, ctx.company_id, event_type=args.get("type"), limit=50)
    lines = [f"{e.created_at.isoformat()} {e.actor} {e.type} {e.target}" for e in events]
    return ToolResult("\n".join(lines) or "Sin eventos.")


tool = Tool(
    name="read_audit",
    description="Lee los últimos eventos de auditoría, con filtro opcional por tipo.",
    input_schema={"type": "object", "properties": {"type": {"type": "string"}}},
    run=run,
)
