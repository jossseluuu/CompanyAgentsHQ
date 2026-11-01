import re
import uuid
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.errors import AppError, NotFound
from app.core.events import emit
from app.core.util import row
from app.domains.audit import service as audit_service
from app.domains.files.extract import extract_text
from app.domains.files.models import File
from app.domains.files.storage import storage

MIME_BY_EXT = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
    "md": "text/markdown",
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}
MAGIC = {"pdf": b"%PDF", "docx": b"PK", "xlsx": b"PK", "png": b"\x89PNG", "jpg": b"\xff\xd8", "jpeg": b"\xff\xd8"}
PREVIEWABLE = {"pdf", "png", "jpg", "jpeg", "webp", "txt", "md", "csv"}
SORTABLE = {"name": File.name, "created_at": File.created_at, "size": File.size_bytes}


def safe_name(name: str) -> str:
    cleaned = re.sub(r"[^\w.\- ]", "_", name.replace("\\", "/").rsplit("/", 1)[-1]).strip(" .")
    if not cleaned:
        raise AppError("invalid_name", "Nombre de fichero no válido", 422)
    return cleaned[:200]


def _validate(name: str, data: bytes) -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in MIME_BY_EXT:
        raise AppError("unsupported_type", f"Tipo de fichero no permitido: .{ext}", 415)
    limit = get_settings().max_upload_mb * 1024 * 1024
    if len(data) > limit:
        raise AppError("file_too_large", f"El máximo son {get_settings().max_upload_mb} MB", 413)
    magic = MAGIC.get(ext)
    if magic and not data.startswith(magic):
        raise AppError("type_mismatch", "El contenido no coincide con la extensión", 415)
    return MIME_BY_EXT[ext]


async def create(
    db: AsyncSession,
    company_id: uuid.UUID,
    room_id: uuid.UUID,
    name: str,
    data: bytes,
    *,
    agent_id: uuid.UUID | None = None,
    task_id: uuid.UUID | None = None,
    folder: str = "",
) -> File:
    name = safe_name(name)
    mime = _validate(name, data)
    previous = await _latest_version(db, room_id, folder, name)
    version = previous.version + 1 if previous else 1
    if previous:
        previous.deleted_at = utcnow()
    file_id = uuid.uuid4()
    key = f"{company_id}/{room_id}/{file_id}/{name}"
    await storage().put(key, data, mime)
    file = File(
        id=file_id, company_id=company_id, room_id=room_id, folder=folder, name=name, mime_type=mime,
        size_bytes=len(data), storage_key=key, version=version, text_content=extract_text(name, data),
        created_by_agent_id=agent_id, created_by_task_id=task_id,
    )  # fmt: skip
    db.add(file)
    await db.flush()
    await audit_service.record(
        db, company_id, str(agent_id or "owner"), "file.created", str(file.id), {"name": name, "room_id": str(room_id)}
    )
    await emit(db, "file.created", {"id": file.id, "room_id": room_id, "name": name, "agent_id": agent_id})
    return file


async def read_key(key: str) -> bytes:
    return await storage().get(key)


async def write_key(key: str, data: bytes, mime: str) -> None:
    await storage().put(key, data, mime)


async def _latest_version(db: AsyncSession, room_id: uuid.UUID, folder: str, name: str) -> File | None:
    stmt = (
        select(File)
        .where(File.room_id == room_id, File.folder == folder, File.name == name, File.deleted_at.is_(None))
        .order_by(File.version.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def get(db: AsyncSession, company_id: uuid.UUID, file_id: uuid.UUID) -> File:
    file = await db.get(File, file_id)
    if file is None or file.company_id != company_id:
        raise NotFound("Fichero")
    return file


async def read_bytes(file: File) -> bytes:
    return await storage().get(file.storage_key)


async def versions(db: AsyncSession, file: File) -> list[File]:
    stmt = (
        select(File)
        .where(File.room_id == file.room_id, File.folder == file.folder, File.name == file.name)
        .order_by(File.version.desc())
    )
    return list((await db.execute(stmt)).scalars())


async def list_files(
    db: AsyncSession,
    room_id: uuid.UUID,
    *,
    trash: bool = False,
    ext: str | None = None,
    agent_id: uuid.UUID | None = None,
    sort: str = "created_at",
    descending: bool = True,
    folder: str | None = None,
) -> list[File]:
    condition = File.deleted_at.isnot(None) if trash else File.deleted_at.is_(None)
    stmt = select(File).where(File.room_id == room_id, condition)
    if ext:
        stmt = stmt.where(File.name.ilike(f"%.{ext}"))
    if agent_id:
        stmt = stmt.where(File.created_by_agent_id == agent_id)
    if folder is not None:
        stmt = stmt.where(File.folder == folder)
    column = SORTABLE.get(sort, File.created_at)
    return list((await db.execute(stmt.order_by(column.desc() if descending else column.asc()))).scalars())


async def trash(db: AsyncSession, file: File, actor: str = "owner") -> None:
    file.deleted_at = utcnow()
    await audit_service.record(db, file.company_id, actor, "file.deleted", str(file.id), {"name": file.name})
    await emit(db, "file.deleted", {"id": file.id, "room_id": file.room_id})


async def restore(db: AsyncSession, file: File) -> None:
    file.deleted_at = None
    await audit_service.record(db, file.company_id, "owner", "file.restored", str(file.id), {"name": file.name})
    await emit(db, "file.created", {"id": file.id, "room_id": file.room_id, "name": file.name})


async def move(db: AsyncSession, file: File, room_id: uuid.UUID) -> None:
    previous = file.room_id
    file.room_id = room_id
    await audit_service.record(
        db, file.company_id, "owner", "file.moved", str(file.id), {"from": str(previous), "to": str(room_id)}
    )
    await emit(db, "file.created", {"id": file.id, "room_id": room_id, "name": file.name})
    await emit(db, "file.deleted", {"id": file.id, "room_id": previous})


async def copy(db: AsyncSession, file: File, room_id: uuid.UUID) -> File:
    return await create(db, file.company_id, room_id, file.name, await read_bytes(file))


async def search(
    db: AsyncSession, company_id: uuid.UUID, query: str, room_ids: list[uuid.UUID] | None = None, limit: int = 20
) -> list[dict[str, Any]]:
    pattern = f"%{query}%"
    ts_query = func.plainto_tsquery("spanish", query)
    document = func.to_tsvector("spanish", File.text_content)
    stmt = select(File).where(
        File.company_id == company_id,
        File.deleted_at.is_(None),
        or_(File.name.ilike(pattern), document.op("@@")(ts_query), File.text_content.ilike(pattern)),
    )
    if room_ids is not None:
        stmt = stmt.where(File.room_id.in_(room_ids))
    found = (await db.execute(stmt.order_by(File.created_at.desc()).limit(limit))).scalars()
    return [{**row(f, "text_content", "storage_key"), "snippet": _snippet(f.text_content, query)} for f in found]


def _snippet(text: str, query: str) -> str:
    at = text.lower().find(query.lower())
    return text[max(at - 80, 0) : at + 160] if at >= 0 else text[:200]
