from typing import Any

from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.tasks import service as tasks_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    room_id = ctx.task.room_id if ctx.task else ctx.agent.home_room_id
    task = await tasks_service.create_task(
        ctx.db, ctx.company_id, title=args["title"], instructions=args.get("instructions", ""), room_id=room_id,
        requested_by=ctx.agent.id,
    )  # fmt: skip
    return ToolResult(f"Tarjeta creada en el tablón (id {task.id}), sin asignar.")


tool = Tool(
    name="create_task",
    description="Añade una tarjeta sin asignar al tablón de la sala.",
    input_schema={
        "type": "object",
        "properties": {"title": {"type": "string"}, "instructions": {"type": "string"}},
        "required": ["title"],
    },
    run=run,
)
