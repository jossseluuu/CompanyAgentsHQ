import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Entity


class Agent(Entity):
    __tablename__ = "agents"

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(60))
    avatar: Mapped[str] = mapped_column(String(60), default="default")
    personality: Mapped[str] = mapped_column(Text, default="")
    department_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"))
    home_room_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rooms.id"))
    manager_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"))
    model: Mapped[str] = mapped_column(String(160), default="fast")
    temperature: Mapped[float] = mapped_column(Float, default=0.3)
    tools: Mapped[list[str]] = mapped_column(JSONB, default=list)
    daily_budget_eur: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.5"))
    status: Mapped[str] = mapped_column(String(20), default="idle")
    pause_reason: Mapped[str] = mapped_column(String(200), default="")
    current_room_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rooms.id"))
    current_task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    pos_x: Mapped[int] = mapped_column(Integer, default=0)
    pos_y: Mapped[int] = mapped_column(Integer, default=0)
    seat_x: Mapped[int] = mapped_column(Integer, default=0)
    seat_y: Mapped[int] = mapped_column(Integer, default=0)
    idle_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resting_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    steps_since_rest: Mapped[int] = mapped_column(Integer, default=0)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AgentPromptVersion(Entity):
    __tablename__ = "agent_prompt_versions"

    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    system_prompt: Mapped[str] = mapped_column(Text)
    author: Mapped[str] = mapped_column(String(120), default="owner")
    note: Mapped[str] = mapped_column(String(300), default="")


class Supervision(Entity):
    __tablename__ = "supervisions"

    supervisor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"))
    supervised_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20))  # review | pre_approval | observer
    tools: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    escalate_after_min: Mapped[int | None] = mapped_column(Integer)


class Routine(Entity):
    __tablename__ = "routines"

    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), unique=True)
    rules: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class AgentMemory(Entity):
    __tablename__ = "agent_memories"

    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    summary: Mapped[str] = mapped_column(Text)
    source_task_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)


class Message(Entity):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_agent_created", "agent_id", "created_at"),)

    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20))  # owner | agent | tool
    content: Mapped[str] = mapped_column(Text)
    citations: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
