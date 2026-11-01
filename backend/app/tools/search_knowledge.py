from typing import Any

from app.core.plugins import Tool, ToolContext, ToolResult
from app.domains.knowledge import retriever
from app.domains.knowledge import service as knowledge_service


async def run(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    fragments = await knowledge_service.retrieve_for_agent(ctx.db, ctx.agent, args["query"], args.get("scope"))
    ctx.used_chunks.extend(fragments)
    return ToolResult(retriever.render(fragments) or "Sin resultados en tus bases de conocimiento.")


tool = Tool(
    name="search_knowledge",
    description="Busca en tus bases de conocimiento. scope opcional: agent, room, department o company.",
    input_schema={
        "type": "object",
        "properties": {"query": {"type": "string"}, "scope": {"type": "string"}},
        "required": ["query"],
    },
    run=run,
)
