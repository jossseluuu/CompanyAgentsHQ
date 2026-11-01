from typing import Any

import anthropic

from app.core.config import get_settings
from app.domains.runtime.llm.base import LLMError, LLMRequest, LLMResponse, OnText, ToolCall

FALLBACK_MODELS = ("claude-opus", "claude-sonnet-5-5", "claude-fable")
FALLBACK_BETA = "server-side-fallback-2026-07-01"


def _replayable(block: Any) -> dict[str, Any]:
    """Bloques de la respuesta tal como deben volver en el turno siguiente."""
    kind = block.type
    if kind == "text":
        return {"type": "text", "text": block.text}
    if kind == "tool_use":
        return {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
    if kind == "thinking":
        return {"type": "thinking", "thinking": block.thinking, "signature": block.signature}
    if kind == "redacted_thinking":
        return {"type": "redacted_thinking", "data": block.data}
    dumped: dict[str, Any] = block.model_dump(mode="json", exclude_none=True)
    return dumped


class ClaudeClient:
    def __init__(self) -> None:
        key = get_settings().anthropic_api_key or None
        self.client = anthropic.AsyncAnthropic(api_key=key, max_retries=0, timeout=600)

    @staticmethod
    def _params(request: LLMRequest) -> dict[str, Any]:
        # El contexto fijo se cachea (RNF-COS-06); temperature ya no existe en la API de mensajes.
        params: dict[str, Any] = {
            "model": request.model,
            "max_tokens": request.max_tokens,
            "system": [{"type": "text", "text": request.system, "cache_control": {"type": "ephemeral"}}],
            "messages": request.messages,
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": "low" if request.metadata.get("kind") == "chat" else "medium"},
        }
        if request.tools:
            params["tools"] = [{**t, "eager_input_streaming": True} for t in request.tools]
        if request.model.startswith(FALLBACK_MODELS):
            params["fallbacks"] = "default"
            params["betas"] = [FALLBACK_BETA]
        return params

    async def complete(self, request: LLMRequest, on_text: OnText = None) -> LLMResponse:
        try:
            async with self.client.beta.messages.stream(**self._params(request)) as stream:
                async for text in stream.text_stream:
                    if on_text:
                        await on_text(text)
                message = await stream.get_final_message()
        except anthropic.RateLimitError as exc:
            raise LLMError(f"Límite de peticiones: {exc}", retryable=True) from exc
        except anthropic.APIStatusError as exc:
            raise LLMError(f"Error de Claude {exc.status_code}: {exc.message}", retryable=exc.status_code >= 500) from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError(f"Sin conexión con Claude: {exc}", retryable=True) from exc
        if message.stop_reason == "refusal":
            raise LLMError("El modelo rechazó la petición")
        if message.stop_reason == "max_tokens" and any(b.type == "tool_use" for b in message.content):
            raise LLMError("La respuesta se cortó en mitad de una llamada a herramienta")
        return LLMResponse(
            text="".join(b.text for b in message.content if b.type == "text"),
            tool_calls=[ToolCall(b.id, b.name, b.input) for b in message.content if b.type == "tool_use"],
            content=[_replayable(b) for b in message.content],
            input_tokens=message.usage.input_tokens,
            output_tokens=message.usage.output_tokens,
            model=message.model,
            stop_reason=message.stop_reason or "end_turn",
        )
