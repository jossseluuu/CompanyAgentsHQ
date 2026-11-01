import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, Entity, utcnow


class Trace(Entity):
    __tablename__ = "traces"
    __table_args__ = (Index("ix_traces_agent_created", "agent_id", "created_at"),)

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    step: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(20), default="task")
    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"))
    model: Mapped[str] = mapped_column(String(160))
    prompt_version: Mapped[int] = mapped_column(Integer, default=1)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_eur: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=Decimal(0))
    context: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    output: Mapped[str] = mapped_column(Text, default="")
    tool_calls: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    rag_chunk_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)


class AuditEvent(Base):
    """Solo inserción: un disparador de la base de datos impide UPDATE y DELETE (RNF-TRA-02)."""

    __tablename__ = "audit_events"

    seq: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    actor: Mapped[str] = mapped_column(String(60))  # owner | system | <agent_id>
    type: Mapped[str] = mapped_column(String(60), index=True)
    target: Mapped[str] = mapped_column(String(200), default="")
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    cost_eur: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=Decimal(0))
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Anomaly(Entity):
    __tablename__ = "anomalies"

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    rule: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(20), default="warning")
    evidence: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)


class Notification(Entity):
    __tablename__ = "notifications"

    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("owners.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(300))
    link: Mapped[str] = mapped_column(String(300), default="")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
