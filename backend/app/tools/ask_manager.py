from typing import Any

from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.agents import service as agents_service
from app.domains.office import service as office_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    if ctx.agent.manager_id is None:
        return ToolResult("No tienes jefe a quien preguntar.", is_error=True)
    from app.domains.runtime.loop import ask

    manager = await agents_service.find(ctx.db, ctx.agent.manager_id)
    await office_service.visit(ctx.db, ctx.agent, manager, args["question"])
    question = f"{ctx.agent.name} te pregunta:\n<pregunta>\n{args['question']}\n</pregunta>\nResponde en breve."
    await ctx.db.commit()
    asked = await ask(manager.id, "ask", [{"role": "user", "content": question}], task_id=ctx.task.id)
    return ToolResult(f"{manager.name} responde: {asked.response.text}")


tool = Tool(
    name="ask_manager",
    description="Pregunta a tu jefe directo y espera su respuesta.",
    input_schema={"type": "object", "properties": {"question": {"type": "string"}}, "required": ["question"]},
    run=run,
    core=True,
)
