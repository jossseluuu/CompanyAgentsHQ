from typing import Any

from app.core.db import utcnow
from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.office import service as office_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    room_id = (ctx.task.room_id if ctx.task else None) or ctx.agent.home_room_id
    room = await office_service.get_room(ctx.db, ctx.company_id, room_id)
    module = await office_service.module_row(ctx.db, room_id, "whiteboard")
    if module is None:
        return ToolResult("Esta sala no tiene pizarra.", is_error=True)
    note = {"author": ctx.agent.name, "text": args["text"], "at": utcnow().isoformat()}
    await office_service.configure_module(ctx.db, room, "whiteboard", {"notes": [*module.config.get("notes", []), note]})
    return ToolResult("Nota añadida a la pizarra.")


tool = Tool(
    name="write_whiteboard",
    description="Escribe una nota en la pizarra de la sala.",
    input_schema={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
    run=run,
)
