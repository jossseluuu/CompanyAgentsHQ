import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Entity


class Room(Entity):
    __tablename__ = "rooms"

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(60))
    grid_x: Mapped[int] = mapped_column(Integer)
    grid_y: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    color: Mapped[str] = mapped_column(String(9), default="#94a3b8")
    doors: Mapped[list[list[int]]] = mapped_column(JSONB, default=list)
    restricted: Mapped[bool] = mapped_column(Boolean, default=False)


class RoomModuleRow(Entity):
    __tablename__ = "room_modules"
    __table_args__ = (UniqueConstraint("room_id", "module_key"),)

    room_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"))
    module_key: Mapped[str] = mapped_column(String(60))
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Furniture(Entity):
    __tablename__ = "furniture"

    room_module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("room_modules.id", ondelete="CASCADE"))
    model_key: Mapped[str] = mapped_column(String(60))
    grid_x: Mapped[int] = mapped_column(Integer)
    grid_y: Mapped[int] = mapped_column(Integer)
    rotation: Mapped[int] = mapped_column(Integer, default=0)
    interactive: Mapped[bool] = mapped_column(Boolean, default=False)


class RoomAccess(Entity):
    __tablename__ = "room_access"
    __table_args__ = (UniqueConstraint("room_id", "agent_id"),)

    room_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"))
    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"))
    can_enter: Mapped[bool] = mapped_column(Boolean, default=True)
    can_use_tools: Mapped[bool] = mapped_column(Boolean, default=True)


class AgentMove(Entity):
    """Recorridos guardados para repetirlos desde la ficha (RF-MOV-08)."""

    __tablename__ = "agent_moves"

    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    path: Mapped[list[list[int]]] = mapped_column(JSONB)
    reason: Mapped[str] = mapped_column(String(40), default="")
