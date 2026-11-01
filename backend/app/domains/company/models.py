import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Entity


class Company(Entity):
    __tablename__ = "companies"

    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("owners.id"))
    name: Mapped[str] = mapped_column(String(120))
    mission: Mapped[str] = mapped_column(Text, default="")
    values: Mapped[str] = mapped_column(Text, default="")
    sector: Mapped[str] = mapped_column(String(120), default="")
    locale: Mapped[str] = mapped_column(String(10), default="es")
    timezone: Mapped[str] = mapped_column(String(60), default="Europe/Madrid")
    daily_budget_eur: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("2"))
    monthly_budget_eur: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("30"))
    status: Mapped[str] = mapped_column(String(20), default="active")
    ai_settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class Department(Entity):
    __tablename__ = "departments"

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    color: Mapped[str] = mapped_column(String(9), default="#64748b")
    head_agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
