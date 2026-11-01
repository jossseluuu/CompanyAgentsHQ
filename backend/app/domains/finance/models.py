import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Entity


class FinanceEntry(Entity):
    __tablename__ = "finance_entries"

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    date: Mapped[dt.date] = mapped_column(Date, index=True)
    category: Mapped[str] = mapped_column(String(120))
    amount_eur: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    kind: Mapped[str] = mapped_column(String(10))  # income | expense
    source: Mapped[str] = mapped_column(String(120), default="manual")


class Budget(Entity):
    __tablename__ = "budgets"

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String(120))
    period: Mapped[str] = mapped_column(String(7))  # AAAA-MM
    amount_eur: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    created_by_agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
