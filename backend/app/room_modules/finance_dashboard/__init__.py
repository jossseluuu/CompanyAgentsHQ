import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plugins import BaseRoomModule, FurnitureSpec, KnowledgeSource
from app.domains.finance import service as finance_service


async def _summary(db: AsyncSession, company_id: uuid.UUID) -> str:
    return await finance_service.summary_text(db, company_id)


class FinanceDashboard(BaseRoomModule):
    key = "finance_dashboard"
    name = "Dashboard financiero"
    description = "Ingresos, gastos, gasto de IA, presupuesto frente a real y previsión"
    ui_panel = "finance_dashboard"
    furniture = [FurnitureSpec("screen", 4, 1, interactive=True)]
    default_config = {"currency": "EUR"}
    tool_names = ["read_finance", "create_budget"]

    def knowledge_sources(self) -> list[KnowledgeSource]:
        return [KnowledgeSource("Resumen financiero", _summary)]


module = FinanceDashboard()
