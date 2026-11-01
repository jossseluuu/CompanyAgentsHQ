"""LLM falso: respuestas guionizadas en YAML para desarrollar y probar sin gastar (RF-OTR-07)."""

import uuid
from collections import deque
from pathlib import Path
from typing import Any

import yaml

from app.core.config import BACKEND_DIR
from app.domains.runtime.llm.base import LLMRequest, LLMResponse, OnText, ToolCall

SCRIPT = BACKEND_DIR / "seeds" / "fake_llm" / "script.yaml"


class FakeLLM:
    def __init__(self, path: Path = SCRIPT) -> None:
        self.script: dict[str, list[dict[str, Any]]] = yaml.safe_load(path.read_text(encoding="utf-8"))
        self.forced: deque[LLMResponse | Exception] = deque()
        self.requests: list[LLMRequest] = []

    def push(self, *responses: LLMResponse | Exception) -> None:
        self.forced.extend(responses)

    @staticmethod
    def tool(tool_name: str, /, **tool_input: Any) -> LLMResponse:
        call = ToolCall(f"toolu_{uuid.uuid4().hex[:12]}", tool_name, tool_input)
        block = {"type": "tool_use", "id": call.id, "name": tool_name, "input": tool_input}
        return LLMResponse("", [call], [block], 100, 20, "fake", "tool_use")

    def _steps(self, meta: dict[str, Any]) -> list[dict[str, Any]]:
        kind, role = meta.get("kind", "task"), meta.get("role", "")
        return self.script.get(f"{kind}.{role}") or self.script.get(kind) or self.script["task"]

    @staticmethod
    def _fill(value: Any, variables: dict[str, str]) -> Any:
        if isinstance(value, str):
            for key, replacement in variables.items():
                value = value.replace("{" + key + "}", replacement)
            return value
        if isinstance(value, dict):
            return {k: FakeLLM._fill(v, variables) for k, v in value.items()}
        if isinstance(value, list):
            return [FakeLLM._fill(v, variables) for v in value]
        return value

    def _scripted(self, request: LLMRequest) -> LLMResponse:
        meta = request.metadata
        assistant_turns = sum(1 for m in request.messages if m["role"] == "assistant")
        steps = self._steps(meta)
        step = steps[min(assistant_turns, len(steps) - 1)]
        if meta.get("force_reject") and meta.get("kind") == "review":
            step = {"tool": "review_decision", "input": {"accept": False, "comments": "Falta concretar el resultado."}}
        if assistant_turns >= len(steps) and "tool" in step:
            step = {"text": "Tarea terminada."}
        variables = {
            "title": str(meta.get("title", "")),
            "role": str(meta.get("role", "")),
            "citation": "[1]" if meta.get("fragments") else "",
            "fragment": str(meta.get("first_fragment", "")),
        }
        input_tokens = sum(len(str(m["content"])) for m in request.messages) // 4 + len(request.system) // 4
        if "tool" in step:
            response = self.tool(step["tool"], **self._fill(step.get("input", {}), variables))
            response.input_tokens = input_tokens
            return response
        text = self._fill(step["text"], variables).strip()
        return LLMResponse(text, [], [{"type": "text", "text": text}], input_tokens, len(text) // 4, "fake")

    async def complete(self, request: LLMRequest, on_text: OnText = None) -> LLMResponse:
        self.requests.append(request)
        if self.forced:
            forced = self.forced.popleft()
            if isinstance(forced, Exception):
                raise forced
            response = forced
        else:
            response = self._scripted(request)
        if on_text and response.text:
            for word in response.text.split(" "):
                await on_text(word + " ")
        return response
