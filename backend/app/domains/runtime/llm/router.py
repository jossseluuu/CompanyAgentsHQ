"""Resuelve el modelo de un agente: alias, 'proveedor:modelo' o nombre del proveedor por defecto."""

from typing import Any

import httpx

from app.core.config import get_settings
from app.domains.runtime.llm.base import LLMClient
from app.domains.runtime.llm.claude import ClaudeClient
from app.domains.runtime.llm.fake import FakeLLM
from app.domains.runtime.llm.openai_compat import OpenAICompatibleClient

PROVIDERS = {"anthropic", "ollama", "openai_compatible", "fake"}
fake = FakeLLM()
_claude: ClaudeClient | None = None


def _named(model: str, ai_settings: dict[str, Any]) -> str:
    settings = get_settings()
    if model == "powerful":
        return str(ai_settings.get("powerful_model") or settings.model_powerful)
    if model == "fast":
        return str(ai_settings.get("fast_model") or settings.model_fast)
    return model


def resolve(model: str, ai_settings: dict[str, Any]) -> tuple[LLMClient, str]:
    global _claude
    settings = get_settings()
    if settings.llm_provider == "fake":  # el modo simulado nunca llama fuera (RNF-COS-08)
        return fake, "fake"
    name = _named(model, ai_settings)
    provider, _, rest = name.partition(":")
    if provider not in PROVIDERS or not rest:
        provider, rest = settings.llm_provider, name
    if provider == "ollama":
        return OpenAICompatibleClient(f"{settings.ollama_url}/v1"), rest
    if provider == "openai_compatible":
        return OpenAICompatibleClient(settings.openai_base_url, settings.openai_api_key), rest
    if provider == "fake":
        return fake, "fake"
    _claude = _claude or ClaudeClient()
    return _claude, rest


async def ollama_models() -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            response = await client.get(f"{get_settings().ollama_url}/api/tags")
            response.raise_for_status()
        return sorted(m["name"] for m in response.json().get("models", []))
    except (httpx.HTTPError, ValueError, KeyError):
        return []
