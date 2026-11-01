"""Adaptadores reales contra servidores simulados: ninguna prueba sale a internet."""

import json

import anthropic
import httpx
import httpx2
import pytest

from app.core.config import get_settings
from app.domains.knowledge.embeddings import OllamaEmbeddings
from app.domains.runtime.llm import claude as claude_module
from app.domains.runtime.llm import openai_compat
from app.domains.runtime.llm.base import LLMError, LLMRequest
from app.domains.runtime.llm.claude import ClaudeClient
from app.domains.runtime.llm.router import resolve


def _sse(events: list[dict]) -> bytes:
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


def _anthropic_stream(stop_reason: str = "tool_use") -> bytes:
    usage = {"input_tokens": 11, "output_tokens": 1}
    message = {"id": "msg_1", "type": "message", "role": "assistant", "model": "claude-haiku-5-5", "content": [],
               "stop_reason": None, "stop_sequence": None, "usage": usage}  # fmt: skip
    return _sse(
        [
            {"type": "message_start", "message": message},
            {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
            {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hola"}},
            {"type": "content_block_stop", "index": 0},
            {"type": "content_block_start", "index": 1,
             "content_block": {"type": "tool_use", "id": "toolu_1", "name": "read_file", "input": {}}},
            {"type": "content_block_delta", "index": 1,
             "delta": {"type": "input_json_delta", "partial_json": "{\"file_id\": \"a\"}"}},
            {"type": "content_block_stop", "index": 1},
            {"type": "message_delta", "delta": {"stop_reason": stop_reason, "stop_sequence": None},
             "usage": {"output_tokens": 7}},
            {"type": "message_stop"},
        ]
    )  # fmt: skip


def _claude(handler) -> ClaudeClient:
    client = ClaudeClient.__new__(ClaudeClient)
    client.client = anthropic.AsyncAnthropic(
        api_key="test", max_retries=0, http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler))
    )
    return client


REQUEST = dict(system="Eres un agente", messages=[{"role": "user", "content": "Hola"}])
TOOLS = [{"name": "read_file", "description": "Lee", "input_schema": {"type": "object", "properties": {}}}]


async def test_claude_stream_tools_and_request_shape() -> None:
    seen = {}

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen["body"] = json.loads(request.content)
        seen["beta"] = request.headers.get("anthropic-beta", "")
        return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=_anthropic_stream())

    deltas: list[str] = []

    async def on_text(text: str) -> None:
        deltas.append(text)

    response = await _claude(handler).complete(LLMRequest("claude-opus-5-5", tools=TOOLS, **REQUEST), on_text)
    assert deltas == ["Hola"] and response.text == "Hola"
    assert response.tool_calls[0].input == {"file_id": "a"}
    assert response.content[1] == {"type": "tool_use", "id": "toolu_1", "name": "read_file", "input": {"file_id": "a"}}
    assert (response.input_tokens, response.output_tokens) == (11, 7)
    body = seen["body"]
    assert "temperature" not in body
    assert body["thinking"] == {"type": "adaptive"}
    assert body["fallbacks"] == "default" and claude_module.FALLBACK_BETA in seen["beta"]
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert body["tools"][0]["eager_input_streaming"] is True


async def test_haiku_has_no_server_fallback() -> None:
    assert "fallbacks" not in ClaudeClient._params(LLMRequest("claude-haiku-5-5", **REQUEST))


@pytest.mark.parametrize(("status", "retryable"), [(429, True), (500, True), (400, False)])
async def test_claude_errors_map_to_retryable(status: int, retryable: bool) -> None:
    def handler(_: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(status, json={"type": "error", "error": {"type": "x", "message": "fallo"}})

    with pytest.raises(LLMError) as caught:
        await _claude(handler).complete(LLMRequest("claude-haiku-5-5", **REQUEST))
    assert caught.value.retryable is retryable


async def test_claude_refusal_is_not_retried() -> None:
    def handler(_: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=_anthropic_stream("refusal"))

    with pytest.raises(LLMError) as caught:
        await _claude(handler).complete(LLMRequest("claude-haiku-5-5", **REQUEST))
    assert caught.value.retryable is False


def _patch_httpx(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    original = httpx.AsyncClient

    def build(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return original(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", build)


async def test_local_model_stream_with_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        chunks = [
            {"choices": [{"delta": {"content": "Ho"}}]},
            {"choices": [{"delta": {"content": "la"}}]},
            {"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "c1", "function": {"name": "read_file", "arguments": "{\"file"}}]}}]},
            {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": "_id\": \"a\"}"}}]}}]},
            {"choices": [], "usage": {"prompt_tokens": 5, "completion_tokens": 3}},
        ]  # fmt: skip
        body = "".join(f"data: {json.dumps(c)}\n\n" for c in chunks) + "data: [DONE]\n\n"
        return httpx.Response(200, content=body.encode())

    _patch_httpx(monkeypatch, handler)
    history = [
        {"role": "user", "content": "Hola"},
        {"role": "assistant", "content": [{"type": "tool_use", "id": "c0", "name": "x", "input": {}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "c0", "content": "ok", "is_error": False}]},
    ]
    client = openai_compat.OpenAICompatibleClient("http://local/v1")
    response = await client.complete(LLMRequest("llama3.2", "S", history, TOOLS, 0.7))
    assert response.text == "Hola" and response.tool_calls[0].input == {"file_id": "a"}
    assert response.input_tokens == 5 and seen["temperature"] == 0.7
    assert [m["role"] for m in seen["messages"]] == ["system", "user", "assistant", "tool"]
    assert seen["tools"][0]["function"]["name"] == "read_file"


async def test_ollama_picks_an_installed_chat_model(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "llm_provider", "ollama")

    def tags(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": "bge-m3:latest"}, {"name": "qwen3:8b"}]})

    _patch_httpx(monkeypatch, tags)
    client, model = await resolve("powerful", {})
    assert isinstance(client, openai_compat.OpenAICompatibleClient) and model == "qwen3:8b"
    assert (await resolve("fast", {"fast_model": "ollama:gemma3"}))[1] == "gemma3"


async def test_ollama_never_falls_back_to_paid_api(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "llm_provider", "ollama")
    _patch_httpx(monkeypatch, lambda _: httpx.Response(200, json={"models": []}))
    with pytest.raises(LLMError, match="ollama pull"):
        await resolve("powerful", {})


async def test_ollama_down_pauses_the_agent_instead_of_failing(api, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.domains.runtime.llm import router
    from tests.conftest import agent_id, settle

    async def down() -> list[str]:
        return []

    monkeypatch.setattr(get_settings(), "llm_provider", "ollama")
    monkeypatch.setattr(router, "ollama_models", down)
    task = await api.post("/tasks", {"title": "T", "agent_id": await agent_id(api, "redactor")})
    await settle()
    agent = await api.get(f"/agents/{task['assigned_agent_id']}")
    assert agent["status"] == "paused" and "ollama pull" in agent["pause_reason"]
    assert (await api.get(f"/tasks/{task['id']}"))["blocked_reason"] == "provider"


async def test_ollama_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/embed"
        return httpx.Response(200, json={"embeddings": [[0.1, 0.2]]})

    _patch_httpx(monkeypatch, handler)
    assert await OllamaEmbeddings("bge-m3").embed(["hola"]) == [[0.1, 0.2]]
