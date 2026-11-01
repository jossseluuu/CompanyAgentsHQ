"""Proveedores de embeddings intercambiables: local sin descargas, Ollama, modelos descargados o API compatible."""

import asyncio
import hashlib
import math
import re
from pathlib import Path
from typing import Any, Protocol

import httpx

from app.core.config import get_settings
from app.domains.knowledge.models import EMBEDDING_DIM

WORD = re.compile(r"\w+", re.UNICODE)


class EmbeddingProvider(Protocol):
    key: str

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


def fit(vector: list[float]) -> list[float]:
    """Adapta cualquier dimensión a la columna: rellena con ceros o recorta, y normaliza."""
    sized = (vector + [0.0] * EMBEDDING_DIM)[:EMBEDDING_DIM]
    norm = math.sqrt(sum(v * v for v in sized)) or 1.0
    return [v / norm for v in sized]


class HashEmbeddings:
    """Vector disperso de palabras y trigramas: gratis y sin red, útil en modo simulado."""

    key = "hash:v1"

    @staticmethod
    def _one(text: str) -> list[float]:
        vector = [0.0] * EMBEDDING_DIM
        words = [w.lower() for w in WORD.findall(text)]
        grams = words + [w[i : i + 3] for w in words if len(w) > 3 for i in range(len(w) - 2)]
        for gram in grams:
            digest = hashlib.blake2b(gram.encode(), digest_size=8).digest()
            index = int.from_bytes(digest[:4], "big") % EMBEDDING_DIM
            vector[index] += 1.0 if digest[4] & 1 else -1.0
        return vector

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._one(t) for t in texts]


class OllamaEmbeddings:
    def __init__(self, model: str) -> None:
        self.model = model
        self.key = f"ollama:{model}"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        url = f"{get_settings().ollama_url}/api/embed"
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(url, json={"model": self.model, "input": texts})
            response.raise_for_status()
        embeddings: list[list[float]] = response.json()["embeddings"]
        return embeddings


class OpenAICompatibleEmbeddings:
    """LM Studio, llama.cpp, vLLM o cualquier servidor con /v1/embeddings."""

    def __init__(self, model: str) -> None:
        self.model = model
        self.key = f"openai_compatible:{model}"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        settings = get_settings()
        headers = {"Authorization": f"Bearer {settings.openai_api_key}"} if settings.openai_api_key else {}
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(
                f"{settings.openai_base_url}/embeddings", json={"model": self.model, "input": texts}, headers=headers
            )
            response.raise_for_status()
        return [item["embedding"] for item in response.json()["data"]]


class SentenceTransformerEmbeddings:
    """Modelo descargado por el usuario: nombre de Hugging Face en caché o ruta local."""

    _loaded: dict[str, Any] = {}

    def __init__(self, model: str) -> None:
        self.model = model
        self.key = f"sentence_transformers:{model}"

    def _encode(self, texts: list[str]) -> list[list[float]]:
        from sentence_transformers import SentenceTransformer

        if self.model not in self._loaded:
            self._loaded[self.model] = SentenceTransformer(self.model)
        result: list[list[float]] = self._loaded[self.model].encode(texts, normalize_embeddings=True).tolist()
        return result

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await asyncio.to_thread(self._encode, texts)


def provider_for(ai_settings: dict[str, Any] | None = None) -> EmbeddingProvider:
    settings = get_settings()
    chosen = ai_settings or {}
    name = chosen.get("embeddings_provider") or settings.embeddings_provider
    model = chosen.get("embedding_model") or settings.embedding_model
    if name == "ollama":
        return OllamaEmbeddings(model or "bge-m3")
    if name == "openai_compatible":
        return OpenAICompatibleEmbeddings(model)
    if name == "sentence_transformers":
        return SentenceTransformerEmbeddings(model or "BAAI/bge-m3")
    return HashEmbeddings()


def downloaded_models() -> list[str]:
    """Modelos de Hugging Face ya descargados en este equipo."""
    cache = Path.home() / ".cache" / "huggingface" / "hub"
    if not cache.exists():
        return []
    return sorted(p.name[len("models--") :].replace("--", "/") for p in cache.glob("models--*"))
