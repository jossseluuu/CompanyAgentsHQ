from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.domains.agents import service as agents_service
from app.domains.company.service import CompanyDep
from app.domains.files import service as files_service
from app.domains.knowledge import service as knowledge_service
from app.domains.runtime import service
from app.domains.tasks import service as tasks_service

router = APIRouter(tags=["search"])
Db = Annotated[AsyncSession, Depends(get_db)]


class SearchIn(BaseModel):
    query: str = Field(min_length=1, max_length=500)


@router.post("/search")
async def search(body: SearchIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    """Búsqueda global de ficheros, tareas, agentes y conocimiento con sus citas (RF-OTR-01)."""
    needle = body.query.lower()
    agents = await agents_service.summaries(db, company.id)
    bases = await knowledge_service.bases_of(db, company.id)
    fragments = await knowledge_service.retrieve(db, company.id, bases, body.query)
    return {
        "files": await files_service.search(db, company.id, body.query),
        "tasks": await tasks_service.search(db, company.id, body.query),
        "agents": [a for a in agents if needle in a["name"].lower() or needle in a["role"].lower()],
        "knowledge": [f.citation(i) for i, f in enumerate(fragments, start=1)],
    }


@router.post("/knowledge-publish")
async def publish(company: CompanyDep, db: Db) -> dict[str, int]:
    return {"published": len(await service.publish_knowledge(db, company.id))}
