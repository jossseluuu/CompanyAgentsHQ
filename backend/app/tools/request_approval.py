from typing import Any

from app.core.plugins import Tool, ToolContext, ToolResult


async def run(_: ToolContext, args: dict[str, Any]) -> ToolResult:
    comment = args.get("_comment")
    return ToolResult(f"El dueño aprueba.{f' Comentario: {comment}' if comment else ''}")


tool = Tool(
    name="request_approval",
    description="Pide al dueño una decisión. La tarea queda en espera hasta que responda.",
    input_schema={"type": "object", "properties": {"question": {"type": "string"}}, "required": ["question"]},
    run=run,
    sensitive=True,
    core=True,
)
