from typing import Any

from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.files import service as files_service
from app.domains.office import service as office_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    rooms = await office_service.list_rooms(ctx.db, ctx.company_id)
    allowed = [r.id for r in rooms if await office_service.can_enter(ctx.db, ctx.agent, r)]
    if not args.get("all_rooms"):
        own = {ctx.agent.home_room_id, ctx.task.room_id if ctx.task else None}
        allowed = [r for r in allowed if r in own]
    found = await files_service.search(ctx.db, ctx.company_id, args["query"], allowed)
    lines = [f"- {f['name']} (id {f['id']}): {f['snippet'][:160]}" for f in found]
    return ToolResult("\n".join(lines) or "Sin resultados.")


tool = Tool(
    name="search_files",
    description="Busca ficheros por nombre y contenido en tu sala, o en todas las permitidas con all_rooms.",
    input_schema={
        "type": "object",
        "properties": {"query": {"type": "string"}, "all_rooms": {"type": "boolean"}},
        "required": ["query"],
    },
    run=run,
)
