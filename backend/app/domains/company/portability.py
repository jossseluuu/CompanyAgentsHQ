"""Exporta e importa la empresa completa en un ZIP (RF-EMP-06 y RF-EMP-07)."""

import io
import json
import uuid
import zipfile
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, DateTime, Numeric, Table, insert, select, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import Base, utcnow
from app.core.errors import AppError
from app.domains.audit import service as audit_service
from app.domains.files import service as files_service
from app.domains.knowledge import service as knowledge_service
from app.domains.runtime import service as runtime_service

FORMAT = 1
# La cuenta y sus avisos no viajan con la empresa; los vectores se regeneran con los embeddings del destino.
SKIPPED = {"owners", "auth_sessions", "notifications", "realtime_events", "embedding_cache", "kb_chunks"}
INTERRUPTED = {"in_progress", "in_review"}


def _tables() -> list[Table]:
    return [t for t in Base.metadata.sorted_tables if t.name not in SKIPPED]


async def _scoped_rows(db: AsyncSession, company_id: uuid.UUID) -> dict[str, list[dict[str, Any]]]:
    rows: dict[str, list[dict[str, Any]]] = {}
    ids: dict[str, list[Any]] = {}
    for table in _tables():
        if table.name == "companies":
            stmt = select(table).where(table.c.id == company_id)
        elif "company_id" in table.c:
            stmt = select(table).where(table.c.company_id == company_id)
        else:
            link = next(k for k in table.foreign_keys if k.column.table.name in ids)
            stmt = select(table).where(link.parent.in_(ids[link.column.table.name]))
        if "created_at" in table.c:
            stmt = stmt.order_by(table.c.created_at)  # un padre siempre va antes que sus hijos
        rows[table.name] = [dict(r) for r in (await db.execute(stmt)).mappings()]
        if "id" in table.c:
            ids[table.name] = [r["id"] for r in rows[table.name]]
    return rows


def _encode(value: Any) -> str:
    return value.isoformat() if isinstance(value, datetime | date) else str(value)


def _decoded(table: Table, row: dict[str, Any]) -> dict[str, Any]:
    decoded = {}
    for column in table.c:
        value = row.get(column.name)
        if isinstance(value, str):
            if isinstance(column.type, UUID):
                value = uuid.UUID(value)
            elif isinstance(column.type, DateTime):
                value = datetime.fromisoformat(value)
            elif isinstance(column.type, Date):
                value = date.fromisoformat(value)
            elif isinstance(column.type, Numeric):
                value = Decimal(value)
        if column.name in row:
            decoded[column.name] = value
    return decoded


async def export_company(db: AsyncSession, company_id: uuid.UUID) -> bytes:
    rows = await _scoped_rows(db, company_id)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        manifest = {"format": FORMAT, "exported_at": utcnow().isoformat(), "tables": {k: len(v) for k, v in rows.items()}}
        archive.writestr("manifest.json", json.dumps(manifest, indent=2))
        for name, content in rows.items():
            archive.writestr(f"data/{name}.json", json.dumps(content, default=_encode, ensure_ascii=False))
        for file in rows["files"]:
            archive.writestr(f"files/{file['id']}", await files_service.read_key(file["storage_key"]))
    await audit_service.record(db, company_id, "owner", "company.exported", str(company_id), {})
    return buffer.getvalue()


def _open(data: bytes) -> tuple[zipfile.ZipFile, dict[str, list[dict[str, Any]]]]:
    invalid = AppError("invalid_export", "Ese fichero no es una exportación válida", 422)
    limit = get_settings().max_import_mb * 1024 * 1024
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        if sum(i.file_size for i in archive.infolist()) > limit:
            raise AppError("import_too_large", "La exportación supera el tamaño permitido", 413)
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("format") != FORMAT:
            raise invalid
        return archive, {t.name: json.loads(archive.read(f"data/{t.name}.json")) for t in _tables()}
    except (zipfile.BadZipFile, KeyError, ValueError) as exc:
        raise invalid from exc


def _prepare(rows: dict[str, list[dict[str, Any]]], owner_id: uuid.UUID) -> None:
    """Nada queda a medias: lo que estaba en marcha espera al dueño, y el conocimiento se reindexa."""
    rows["companies"][0].update(owner_id=str(owner_id), status="active")
    for task in rows["tasks"]:
        if task["status"] in INTERRUPTED:
            task.update(status="blocked", blocked_reason="imported")
    for agent in rows["agents"]:
        agent.update(status="idle", current_task_id=None)
    for document in rows["kb_documents"]:
        document["status"] = "pending"


async def import_company(db: AsyncSession, owner_id: uuid.UUID, data: bytes) -> uuid.UUID:
    archive, rows = _open(data)
    if len(rows["companies"]) != 1:
        raise AppError("invalid_export", "Ese fichero no es una exportación válida", 422)
    _prepare(rows, owner_id)
    company_id = uuid.UUID(rows["companies"][0]["id"])
    try:
        for table in _tables():
            if rows[table.name]:
                await db.execute(insert(table), [_decoded(table, r) for r in rows[table.name]])
    except IntegrityError as exc:
        raise AppError("company_exists", "Esa empresa ya existe aquí", 409) from exc
    last_seq = "select setval(pg_get_serial_sequence('audit_events', 'seq'), (select max(seq) from audit_events))"
    await db.execute(text(last_seq))
    for file in rows["files"]:
        if not file["storage_key"].startswith(f"{company_id}/") or ".." in file["storage_key"]:
            raise AppError("invalid_export", "Ese fichero no es una exportación válida", 422)
        await files_service.write_key(file["storage_key"], archive.read(f"files/{file['id']}"), file["mime_type"])
    await audit_service.record(db, company_id, "owner", "company.imported", str(company_id), {})
    await runtime_service.request_indexing(db, await knowledge_service.all_documents(db, company_id))
    return company_id
