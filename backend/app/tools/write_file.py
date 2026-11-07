from typing import Any

from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.files import service as files_service
from app.domains.office import service as office_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    room_id = (ctx.task.room_id if ctx.task else None) or ctx.agent.home_room_id
    room = await office_service.get_room(ctx.db, ctx.company_id, room_id)
    if not await office_service.can_enter(ctx.db, ctx.agent, room):
        return ToolResult("No tienes acceso a esa sala.", is_error=True)
    name = args["name"] if "." in args["name"] else f"{args['name']}.md"
    file = await files_service.create(
        ctx.db, ctx.company_id, room_id, name, args["content"].encode(), agent_id=ctx.agent.id,
        task_id=ctx.task.id if ctx.task else None,
    )  # fmt: skip
    return ToolResult(f"Guardado {file.name} (id {file.id}, versión {file.version}).")


tool = Tool(
    name="write_file",
    description="Crea o actualiza un fichero de texto en tu sala.",
    input_schema={
        "type": "object",
        "properties": {"name": {"type": "string"}, "content": {"type": "string"}},
        "required": ["name", "content"],
    },
    run=run,
)
