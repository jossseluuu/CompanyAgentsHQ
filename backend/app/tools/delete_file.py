import uuid
from typing import Any

from app.core.errors import AppError
from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.files import service as files_service
from app.domains.office import service as office_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    try:
        file = await files_service.get(ctx.db, ctx.company_id, uuid.UUID(args["file_id"]))
    except (ValueError, AppError):
        return ToolResult("Fichero no encontrado.", is_error=True)
    room = await office_service.get_room(ctx.db, ctx.company_id, file.room_id)
    if not await office_service.can_enter(ctx.db, ctx.agent, room):
        return ToolResult("No tienes acceso a esa sala.", is_error=True)
    await files_service.trash(ctx.db, file, str(ctx.agent.id))
    return ToolResult(f"{file.name} movido a la papelera.")


tool = Tool(
    name="delete_file",
    description="Mueve un fichero a la papelera. Requiere aprobación del dueño.",
    input_schema={"type": "object", "properties": {"file_id": {"type": "string"}}, "required": ["file_id"]},
    run=run,
    sensitive=True,
    core=True,
)
