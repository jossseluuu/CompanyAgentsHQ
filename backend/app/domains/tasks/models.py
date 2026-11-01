import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Entity


class Goal(Entity):
    __tablename__ = "goals"

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # planning | plan_review | running | done | rejected | failed
    status: Mapped[str] = mapped_column(String(20), default="planning")
    plan: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Task(Entity):
    __tablename__ = "tasks"
    __table_args__ = (Index("ix_tasks_agent_status", "assigned_agent_id", "status"),)

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    instructions: Mapped[str] = mapped_column(Text, default="")
    # pending | in_progress | in_review | blocked | done | failed | cancelled
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    blocked_reason: Mapped[str] = mapped_column(String(60), default="")
    priority: Mapped[int] = mapped_column(Integer, default=2)  # 1 alta, 2 media, 3 baja
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    goal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("goals.id", ondelete="SET NULL"))
    parent_task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id"))
    room_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rooms.id"))
    assigned_agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"))
    requested_by_agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"))
    reviewer_agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"))
    result_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    result_text: Mapped[str] = mapped_column(Text, default="")
    review_comment: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str] = mapped_column(Text, default="")
    steps_used: Mapped[int] = mapped_column(Integer, default=0)
    rejections: Mapped[int] = mapped_column(Integer, default=0)
    depth: Mapped[int] = mapped_column(Integer, default=0)
    recurrence: Mapped[str] = mapped_column(String(40), default="")
    conversation: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)


class TaskDependency(Entity):
    __tablename__ = "task_dependencies"

    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"))
    depends_on_task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"))


class Meeting(Entity):
    __tablename__ = "meetings"

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    topic: Mapped[str] = mapped_column(String(200))
    participants: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)))
    max_rounds: Mapped[int] = mapped_column(Integer, default=2)
    transcript: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    minutes_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
