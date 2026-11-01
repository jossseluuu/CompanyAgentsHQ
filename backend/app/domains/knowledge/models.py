import uuid
from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Computed, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, Entity

EMBEDDING_DIM = 1024


class KnowledgeBase(Entity):
    __tablename__ = "knowledge_bases"

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(160))
    scope: Mapped[str] = mapped_column(String(20))  # company | department | room | module | agent
    scope_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    description: Mapped[str] = mapped_column(Text, default="")


class KbDocument(Entity):
    __tablename__ = "kb_documents"

    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), index=True
    )
    file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    source_ref: Mapped[str] = mapped_column(String(300), default="")
    title: Mapped[str] = mapped_column(String(255), default="")
    inline_text: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | indexed | failed
    error: Mapped[str] = mapped_column(Text, default="")
    embedding_model: Mapped[str] = mapped_column(String(160), default="")
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class KbChunk(Entity):
    __tablename__ = "kb_chunks"
    __table_args__ = (
        Index(
            "ix_kb_chunks_embedding",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        Index("ix_kb_chunks_tsv", "tsv", postgresql_using="gin"),
    )

    kb_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("kb_documents.id", ondelete="CASCADE"), index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    page: Mapped[int | None] = mapped_column(Integer)
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    embedding_model: Mapped[str] = mapped_column(String(160), default="", index=True)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    tsv: Mapped[Any] = mapped_column(TSVECTOR, Computed("to_tsvector('spanish', content)", persisted=True))


class KbPermission(Entity):
    __tablename__ = "kb_permissions"

    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), index=True
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    can_read: Mapped[bool] = mapped_column(Boolean, default=True)
    can_write: Mapped[bool] = mapped_column(Boolean, default=False)


class EmbeddingCache(Base):
    """El mismo texto con el mismo modelo no se vuelve a calcular (RNF-COS-05)."""

    __tablename__ = "embedding_cache"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
