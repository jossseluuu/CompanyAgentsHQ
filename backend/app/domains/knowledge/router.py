import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.errors import AppError
from app.core.util import row
from app.domains.company.service import CompanyDep
from app.domains.files import service as files_service
from app.domains.knowledge import service
from app.domains.runtime import service as runtime_service

router = APIRouter(prefix="/knowledge-bases", tags=["knowledge"])
Db = Annotated[AsyncSession, Depends(get_db)]


class BaseIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    scope: str = Field(pattern="^(company|department|room|module|agent)$")
    scope_id: uuid.UUID | None = None
    description: str = ""


class DocumentIn(BaseModel):
    file_id: uuid.UUID | None = None
    title: str = ""
    text: str = ""


class QueryIn(BaseModel):
    query: str = Field(min_length=1)


class PermissionIn(BaseModel):
    agent_id: uuid.UUID
    can_read: bool = True
    can_write: bool = False


@router.get("")
async def list_bases(company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    return await service.list_bases(db, company.id)


@router.post("", status_code=201)
async def create_base(body: BaseIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    return row(await service.ensure_base(db, company.id, body.scope, body.scope_id, body.name, body.description))


@router.get("/{base_id}/documents")
async def documents(base_id: uuid.UUID, company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    await service.get_base(db, company.id, base_id)
    return await service.documents(db, base_id)


@router.post("/{base_id}/documents", status_code=201)
async def add_document(base_id: uuid.UUID, body: DocumentIn, company: CompanyDep, db: Db) -> dict[str, Any]:
    base = await service.get_base(db, company.id, base_id)
    document = await service.add_document(db, base, file_id=body.file_id, title=body.title, inline_text=body.text)
    await runtime_service.request_indexing(db, [document.id])
    return row(document, "inline_text")


@router.post("/{base_id}/upload", status_code=201)
async def upload(
    base_id: uuid.UUID, file: UploadFile, room_id: Annotated[uuid.UUID, Form()], company: CompanyDep, db: Db
) -> dict[str, Any]:
    base = await service.get_base(db, company.id, base_id)
    stored = await files_service.create(db, company.id, room_id, file.filename or "fichero", await file.read())
    document = await service.add_document(db, base, file_id=stored.id)
    await runtime_service.request_indexing(db, [document.id])
    return row(document, "inline_text")


@router.post("/{base_id}/query")
async def query(base_id: uuid.UUID, body: QueryIn, company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    return await service.query_base(db, await service.get_base(db, company.id, base_id), body.query)


@router.post("/{base_id}/reindex")
async def reindex(base_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, int]:
    await service.get_base(db, company.id, base_id)
    ids = await service.documents_to_reindex(db, base_id)
    await runtime_service.request_indexing(db, ids)
    return {"queued": len(ids)}


@router.put("/{base_id}/permissions")
async def permissions(base_id: uuid.UUID, body: PermissionIn, company: CompanyDep, db: Db) -> dict[str, bool]:
    await service.get_base(db, company.id, base_id)
    if body.can_write and not body.can_read:
        raise AppError("invalid_permission", "Escribir exige poder leer", 422)
    await service.grant(db, base_id, body.agent_id, body.can_read, body.can_write)
    return {"ok": True}
