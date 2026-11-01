import uuid
from typing import Any

from app.core.errors import AppError
from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.tasks import service as tasks_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    try:
        task = await tasks_service.get_task(ctx.db, ctx.company_id, uuid.UUID(args["task_id"]))
    except (ValueError, AppError):
        return ToolResult("Tarea no encontrada.", is_error=True)
    await tasks_service.patch(ctx.db, task, {"priority": int(args["priority"])})
    return ToolResult("Prioridad actualizada.")


tool = Tool(
    name="update_task",
    description="Cambia la prioridad (1 alta, 3 baja) de una tarjeta del tablón.",
    input_schema={
        "type": "object",
        "properties": {"task_id": {"type": "string"}, "priority": {"type": "integer"}},
        "required": ["task_id", "priority"],
    },
    run=run,
)
