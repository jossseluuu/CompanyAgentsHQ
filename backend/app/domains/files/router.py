import uuid
from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.util import row, rows
from app.domains.company.service import CompanyDep
from app.domains.files import service
from app.domains.office import service as office_service

router = APIRouter(tags=["files"])
Db = Annotated[AsyncSession, Depends(get_db)]
EXCLUDE = ("text_content", "storage_key")


class Destination(BaseModel):
    room_id: uuid.UUID


@router.get("/rooms/{room_id}/files")
async def list_files(
    room_id: uuid.UUID,
    company: CompanyDep,
    db: Db,
    trash: bool = False,
    ext: str | None = None,
    agent: uuid.UUID | None = None,
    sort: str = "created_at",
    desc: bool = True,
    folder: str | None = None,
) -> list[dict[str, Any]]:
    await office_service.get_room(db, company.id, room_id)
    found = await service.list_files(
        db, room_id, trash=trash, ext=ext, agent_id=agent, sort=sort, descending=desc, folder=folder
    )
    return rows(found, *EXCLUDE)


@router.post("/rooms/{room_id}/files", status_code=201)
async def upload(room_id: uuid.UUID, file: UploadFile, company: CompanyDep, db: Db, folder: str = "") -> dict[str, Any]:
    await office_service.get_room(db, company.id, room_id)
    data = await file.read()
    return row(await service.create(db, company.id, room_id, file.filename or "fichero", data, folder=folder), *EXCLUDE)


@router.get("/files/search")
async def search(q: Annotated[str, Query(min_length=1)], company: CompanyDep, db: Db) -> list[dict[str, Any]]:
    return await service.search(db, company.id, q)


@router.get("/files/{file_id}")
async def download(file_id: uuid.UUID, company: CompanyDep, db: Db, preview: bool = False) -> Response:
    file = await service.get(db, company.id, file_id)
    ext = file.name.rsplit(".", 1)[-1].lower()
    inline = preview and ext in service.PREVIEWABLE
    disposition = "inline" if inline else "attachment"
    media = "text/plain; charset=utf-8" if inline and ext in {"txt", "md", "csv"} else file.mime_type
    return Response(
        await service.read_bytes(file),
        media_type=media,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(file.name)}",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
        },
    )


@router.get("/files/{file_id}/meta")
async def meta(file_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, Any]:
    file = await service.get(db, company.id, file_id)
    return {**row(file, "storage_key"), "versions": rows(await service.versions(db, file), *EXCLUDE)}


@router.delete("/files/{file_id}", status_code=204)
async def to_trash(file_id: uuid.UUID, company: CompanyDep, db: Db) -> None:
    await service.trash(db, await service.get(db, company.id, file_id))


@router.post("/files/{file_id}/restore")
async def restore(file_id: uuid.UUID, company: CompanyDep, db: Db) -> dict[str, bool]:
    await service.restore(db, await service.get(db, company.id, file_id))
    return {"ok": True}


@router.post("/files/{file_id}/move")
async def move(file_id: uuid.UUID, body: Destination, company: CompanyDep, db: Db) -> dict[str, bool]:
    await office_service.get_room(db, company.id, body.room_id)
    await service.move(db, await service.get(db, company.id, file_id), body.room_id)
    return {"ok": True}


@router.post("/files/{file_id}/copy", status_code=201)
async def copy(file_id: uuid.UUID, body: Destination, company: CompanyDep, db: Db) -> dict[str, Any]:
    await office_service.get_room(db, company.id, body.room_id)
    return row(await service.copy(db, await service.get(db, company.id, file_id), body.room_id), *EXCLUDE)
