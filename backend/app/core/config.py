from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore", env_ignore_empty=True)

    app_env: str = "dev"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/companyagentshq"
    redis_url: str = "redis://localhost:6379/0"
    bus_backend: str = "memory"
    queue_backend: str = "inline"

    storage_backend: str = "local"
    storage_dir: Path = BACKEND_DIR / ".local" / "storage"
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "companyagentshq"
    max_upload_mb: int = 50
    max_import_mb: int = 1024

    llm_provider: str = "fake"
    anthropic_api_key: str = ""
    openai_base_url: str = "http://localhost:1234/v1"
    openai_api_key: str = ""
    ollama_url: str = "http://localhost:11434"
    local_llm_concurrency: int = 1
    model_powerful: str = "claude-opus-5-5"
    model_fast: str = "claude-haiku-5-5"
    usd_to_eur: float = 0.92

    embeddings_provider: str = "hash"
    embedding_model: str = ""
    searxng_url: str = ""

    cookie_secure: bool = False
    cors_origin: str = "http://localhost:5173"
    session_days: int = 14

    walk_seconds_per_tile: float = 0.2
    idle_rest_seconds: int = 120
    tick_seconds: int = 15
    max_steps_per_task: int = 15
    max_delegation_depth: int = 3
    max_rejections: int = 3
    max_web_searches: int = 10
    rag_max_chunks: int = 8
    rag_max_tokens: int = 3000
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
