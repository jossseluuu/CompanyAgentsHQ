from typing import Any

from app.core.config import get_settings
from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.agents import service as agents_service
from app.domains.runtime.queue import enqueue
from app.domains.tasks import service as tasks_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    if ctx.task.depth + 1 >= get_settings().max_delegation_depth:
        return ToolResult("Límite de delegación alcanzado: hazlo tú.", is_error=True)
    team = await agents_service.subordinates(ctx.db, ctx.agent.id)
    target = next((a for a in team if a.role == args["to_role"]), None)
    if target is None:
        names = ", ".join(a.role for a in team) or "nadie"
        return ToolResult(f"Solo puedes delegar en subordinados directos: {names}.", is_error=True)
    if await tasks_service.duplicate_delegation(ctx.db, ctx.task.id, target.id, args["instructions"]):
        return ToolResult("Esa tarea ya está delegada con el mismo texto.", is_error=True)
    child = await tasks_service.create_task(
        ctx.db, ctx.company_id, title=args["title"], instructions=args["instructions"], agent_id=target.id,
        room_id=target.home_room_id, goal_id=ctx.task.goal_id, parent_task_id=ctx.task.id,
        requested_by=ctx.agent.id, reviewer_id=ctx.agent.id, depth=ctx.task.depth + 1,
    )  # fmt: skip
    enqueue(ctx.db, "run_task", child.id)
    from app.domains.office import service as office_service

    await office_service.visit(ctx.db, ctx.agent, target, f"Te paso: {args['title']}")
    return ToolResult(f"Tarea creada para {target.name}. Recibirás su resultado al terminar.")


tool = Tool(
    name="delegate_task",
    description="Crea una tarea para un subordinado directo. to_role es su rol (p. ej. redactor).",
    input_schema={
        "type": "object",
        "properties": {
            "to_role": {"type": "string"},
            "title": {"type": "string"},
            "instructions": {"type": "string"},
        },
        "required": ["to_role", "title", "instructions"],
    },
    run=run,
    core=True,
)
