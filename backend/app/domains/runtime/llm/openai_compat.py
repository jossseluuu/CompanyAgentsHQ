"""Modelos locales: Ollama, LM Studio, llama.cpp o cualquier servidor con /v1/chat/completions."""

import json
from typing import Any

import httpx

from app.domains.runtime.llm.base import LLMError, LLMRequest, LLMResponse, OnText, ToolCall


MAX_OUTPUT_TOKENS = 4096


def _messages(system: str, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    converted: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for message in messages:
        content = message["content"]
        if isinstance(content, str):
            converted.append({"role": message["role"], "content": content})
            continue
        texts = [b["text"] for b in content if b["type"] == "text"]
        calls = [
            {"id": b["id"], "type": "function",
             "function": {"name": b["name"], "arguments": json.dumps(b["input"], ensure_ascii=False)}}
            for b in content
            if b["type"] == "tool_use"
        ]  # fmt: skip
        if message["role"] == "assistant":
            entry: dict[str, Any] = {"role": "assistant", "content": "\n".join(texts)}
            if calls:
                entry["tool_calls"] = calls
            converted.append(entry)
            continue
        for block in content:
            if block["type"] == "tool_result":
                converted.append({"role": "tool", "tool_call_id": block["tool_use_id"], "content": block["content"]})
        if texts:
            converted.append({"role": "user", "content": "\n".join(texts)})
    return converted


def _tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"type": "function",
         "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
        for t in tools
    ]  # fmt: skip


class OpenAICompatibleClient:
    def __init__(self, base_url: str, api_key: str = "") -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

    async def complete(self, request: LLMRequest, on_text: OnText = None) -> LLMResponse:
        body: dict[str, Any] = {
            "model": request.model,
            "messages": _messages(request.system, request.messages),
            "temperature": request.temperature,
            "max_tokens": min(request.max_tokens, MAX_OUTPUT_TOKENS),
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if request.tools:
            body["tools"] = _tools(request.tools)
        text = ""
        calls: dict[int, dict[str, str]] = {}
        usage: dict[str, int] = {}
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(600, connect=10)) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/chat/completions", json=body, headers=self.headers
                ) as response:
                    if response.status_code >= 400:
                        detail = (await response.aread()).decode(errors="replace")[:300]
                        raise LLMError(f"Error {response.status_code}: {detail}", response.status_code >= 500)
                    async for line in response.aiter_lines():
                        if not line.startswith("data: ") or line.endswith("[DONE]"):
                            continue
                        chunk = json.loads(line[6:])
                        usage = chunk.get("usage") or usage
                        for choice in chunk.get("choices", []):
                            delta = choice.get("delta", {})
                            if delta.get("content"):
                                text += delta["content"]
                                if on_text:
                                    await on_text(delta["content"])
                            for call in delta.get("tool_calls") or []:
                                slot = calls.setdefault(call.get("index", 0), {"id": "", "name": "", "args": ""})
                                slot["id"] = call.get("id") or slot["id"]
                                function = call.get("function", {})
                                slot["name"] = function.get("name") or slot["name"]
                                slot["args"] += function.get("arguments") or ""
        except httpx.TransportError as exc:
            raise LLMError(f"Sin conexión con el modelo local: {exc!r}", retryable=True) from exc
        tool_calls = []
        for index, slot in sorted(calls.items()):
            try:
                arguments = json.loads(slot["args"] or "{}")
            except json.JSONDecodeError:
                arguments = {}
            tool_calls.append(ToolCall(slot["id"] or f"call_{index}", slot["name"], arguments))
        content: list[dict[str, Any]] = [{"type": "text", "text": text}] if text else []
        content += [{"type": "tool_use", "id": c.id, "name": c.name, "input": c.input} for c in tool_calls]
        return LLMResponse(
            text, tool_calls, content, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), request.model
        )
