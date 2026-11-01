from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

OnText = Callable[[str], Awaitable[None]] | None


class LLMError(Exception):
    def __init__(self, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass
class LLMRequest:
    """Los mensajes usan bloques de contenido; cada adaptador los traduce a su proveedor."""

    model: str
    system: str
    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]] = field(default_factory=list)
    temperature: float = 0.3
    max_tokens: int = 16000
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResponse:
    text: str
    tool_calls: list[ToolCall]
    content: list[dict[str, Any]]  # bloques que se devuelven tal cual en el turno siguiente
    input_tokens: int
    output_tokens: int
    model: str
    stop_reason: str = "end_turn"


class LLMClient(Protocol):
    async def complete(self, request: LLMRequest, on_text: OnText = None) -> LLMResponse: ...


def text_response(text: str, model: str, input_tokens: int, output_tokens: int) -> LLMResponse:
    return LLMResponse(text, [], [{"type": "text", "text": text}], input_tokens, output_tokens, model)
