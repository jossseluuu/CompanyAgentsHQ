import hashlib
import uuid
from typing import Any

import httpx
from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import plugins
from app.core.db import utcnow
from app.core.errors import AppError, EmbeddingsDown, NotFound
from app.core.events import emit
from app.core.util import row
from app.domains.audit import service as audit_service
from app.domains.files import service as files_service
from app.domains.files.extract import extract_pages
from app.domains.knowledge import retriever
from app.domains.knowledge.chunking import chunk_pages
from app.domains.knowledge.embeddings import EmbeddingProvider, fit, provider_for
from app.domains.knowledge.models import EmbeddingCache, KbChunk, KbDocument, KbPermission, KnowledgeBase
from app.domains.knowledge.retriever import Fragment

EMBED_BATCH = 32


async def _ai_settings(db: AsyncSession, company_id: uuid.UUID) -> dict[str, Any]:
    result = await db.execute(text("select ai_settings from companies where id = :id"), {"id": company_id})
    return result.scalar_one() or {}


async def provider(db: AsyncSession, company_id: uuid.UUID) -> EmbeddingProvider:
    return provider_for(await _ai_settings(db, company_id))


async def ensure_base(
    db: AsyncSession, company_id: uuid.UUID, scope: str, scope_id: uuid.UUID | None, name: str, description: str = ""
) -> KnowledgeBase:
    stmt = select(KnowledgeBase).where(
        KnowledgeBase.company_id == company_id, KnowledgeBase.scope == scope, KnowledgeBase.scope_id == scope_id
    )
    existing = (await db.execute(stmt)).scalars().first()
    if existing is not None:
        return existing
    base = KnowledgeBase(company_id=company_id, scope=scope, scope_id=scope_id, name=name, description=description)
    db.add(base)
    await db.flush()
    return base


async def get_base(db: AsyncSession, company_id: uuid.UUID, base_id: uuid.UUID) -> KnowledgeBase:
    base = await db.get(KnowledgeBase, base_id)
    if base is None or base.company_id != company_id:
        raise NotFound("Base de conocimiento")
    return base


async def base_for_room(db: AsyncSession, company_id: uuid.UUID, room_id: uuid.UUID) -> KnowledgeBase | None:
    stmt = select(KnowledgeBase).where(
        KnowledgeBase.company_id == company_id, KnowledgeBase.scope == "room", KnowledgeBase.scope_id == room_id
    )
    return (await db.execute(stmt)).scalars().first()


async def company_base(db: AsyncSession, company_id: uuid.UUID) -> KnowledgeBase:
    return await ensure_base(db, company_id, "company", None, "Conocimiento de empresa")


async def bases_of(db: AsyncSession, company_id: uuid.UUID) -> list[KnowledgeBase]:
    return list((await db.execute(select(KnowledgeBase).where(KnowledgeBase.company_id == company_id))).scalars())


async def list_bases(db: AsyncSession, company_id: uuid.UUID) -> list[dict[str, Any]]:
    stmt = (
        select(KnowledgeBase, func.count(KbDocument.id))
        .outerjoin(KbDocument, KbDocument.knowledge_base_id == KnowledgeBase.id)
        .where(KnowledgeBase.company_id == company_id)
        .group_by(KnowledgeBase.id)
        .order_by(KnowledgeBase.scope, KnowledgeBase.name)
    )
    return [{**row(base), "documents": count} for base, count in await db.execute(stmt)]


async def grant(db: AsyncSession, base_id: uuid.UUID, agent_id: uuid.UUID, can_read: bool, can_write: bool) -> None:
    await db.execute(
        delete(KbPermission).where(KbPermission.knowledge_base_id == base_id, KbPermission.agent_id == agent_id)
    )
    db.add(KbPermission(knowledge_base_id=base_id, agent_id=agent_id, can_read=can_read, can_write=can_write))
    await db.flush()


async def grant_inherited(db: AsyncSession, agent: Any) -> None:
    """Concede lectura de empresa, departamento y sala, y escritura en su base personal (RF-CON-02, RF-CON-03)."""
    personal = await ensure_base(db, agent.company_id, "agent", agent.id, f"Conocimiento de {agent.name}")
    await grant(db, personal.id, agent.id, True, True)
    inherited = [await company_base(db, agent.company_id)]
    if agent.department_id:
        inherited.append(await ensure_base(db, agent.company_id, "department", agent.department_id, "Departamento"))
    if agent.home_room_id:
        inherited.append(await ensure_base(db, agent.company_id, "room", agent.home_room_id, "Sala"))
    for base in inherited:
        await grant(db, base.id, agent.id, True, False)


async def permissions(db: AsyncSession, agent_id: uuid.UUID) -> list[dict[str, Any]]:
    stmt = (
        select(KnowledgeBase, KbPermission)
        .join(KbPermission, KbPermission.knowledge_base_id == KnowledgeBase.id)
        .where(KbPermission.agent_id == agent_id)
        .order_by(KnowledgeBase.scope)
    )
    return [
        {"base_id": b.id, "name": b.name, "scope": b.scope, "can_read": p.can_read, "can_write": p.can_write}
        for b, p in await db.execute(stmt)
    ]


async def readable_bases(db: AsyncSession, agent_id: uuid.UUID, scope: str | None = None) -> list[KnowledgeBase]:
    stmt = (
        select(KnowledgeBase)
        .join(KbPermission, KbPermission.knowledge_base_id == KnowledgeBase.id)
        .where(KbPermission.agent_id == agent_id, KbPermission.can_read.is_(True))
    )
    if scope:
        stmt = stmt.where(KnowledgeBase.scope == scope)
    return list((await db.execute(stmt)).scalars())


async def can_write(db: AsyncSession, agent_id: uuid.UUID, base_id: uuid.UUID) -> bool:
    stmt = select(KbPermission.can_write).where(KbPermission.agent_id == agent_id, KbPermission.knowledge_base_id == base_id)
    return bool((await db.execute(stmt)).scalar_one_or_none())


async def documents(db: AsyncSession, base_id: uuid.UUID) -> list[dict[str, Any]]:
    stmt = (
        select(KbDocument, func.count(KbChunk.id))
        .outerjoin(KbChunk, KbChunk.kb_document_id == KbDocument.id)
        .where(KbDocument.knowledge_base_id == base_id)
        .group_by(KbDocument.id)
        .order_by(KbDocument.created_at.desc())
    )
    return [{**row(d, "inline_text"), "chunks": count} for d, count in await db.execute(stmt)]


async def add_document(
    db: AsyncSession,
    base: KnowledgeBase,
    *,
    file_id: uuid.UUID | None = None,
    title: str = "",
    inline_text: str = "",
    source_ref: str = "",
) -> KbDocument:
    if file_id is None and not inline_text:
        raise AppError("empty_document", "Indica un fichero o un texto", 422)
    if file_id:
        title = title or (await files_service.get(db, base.company_id, file_id)).name
    document = KbDocument(
        knowledge_base_id=base.id, file_id=file_id, title=title, inline_text=inline_text, source_ref=source_ref
    )
    db.add(document)
    await db.flush()
    return document


async def drop_file_documents(db: AsyncSession, base: KnowledgeBase, title: str) -> None:
    """Una versión nueva de un fichero sustituye a la anterior: lo viejo no debe citarse."""
    stmt = select(KbDocument.id).where(
        KbDocument.knowledge_base_id == base.id, KbDocument.title == title, KbDocument.file_id.is_not(None)
    )
    stale = list((await db.execute(stmt)).scalars())
    if stale:
        await db.execute(delete(KbChunk).where(KbChunk.kb_document_id.in_(stale)))
        await db.execute(delete(KbDocument).where(KbDocument.id.in_(stale)))


async def upsert_source(db: AsyncSession, base: KnowledgeBase, source_ref: str, title: str, content: str) -> KbDocument:
    """Sustituye un documento publicado por un módulo; lo identifica su source_ref."""
    stmt = select(KbDocument).where(KbDocument.knowledge_base_id == base.id, KbDocument.source_ref == source_ref)
    document = (await db.execute(stmt)).scalars().first()
    if document is None:
        return await add_document(db, base, title=title, inline_text=content, source_ref=source_ref)
    document.inline_text = content
    document.status = "pending"
    await db.flush()
    return document


async def _embed_cached(db: AsyncSession, embedder: EmbeddingProvider, texts: list[str]) -> list[list[float]]:
    keys = [hashlib.sha256(f"{embedder.key}\0{t}".encode()).hexdigest() for t in texts]
    stmt = select(EmbeddingCache).where(EmbeddingCache.key.in_(keys))
    known = {c.key: list(c.embedding) for c in (await db.execute(stmt)).scalars()}
    missing = sorted({i for i, k in enumerate(keys) if k not in known})
    for start in range(0, len(missing), EMBED_BATCH):
        batch = missing[start : start + EMBED_BATCH]
        try:
            vectors = await embedder.embed([texts[i] for i in batch])
        except httpx.HTTPError as exc:
            raise EmbeddingsDown(repr(exc)) from exc
        for index, vector in zip(batch, vectors, strict=True):
            known[keys[index]] = fit(vector)
    if missing:
        values = [{"key": keys[i], "embedding": known[keys[i]]} for i in missing]
        await db.execute(insert(EmbeddingCache).values(values).on_conflict_do_nothing())
    return [known[k] for k in keys]


async def _load_pages(db: AsyncSession, document: KbDocument, company_id: uuid.UUID) -> list[tuple[int | None, str]]:
    if document.file_id is None:
        return [(None, document.inline_text)]
    file = await files_service.get(db, company_id, document.file_id)
    return extract_pages(file.name, await files_service.read_bytes(file))


async def index_document(db: AsyncSession, document_id: uuid.UUID) -> None:
    document = await db.get(KbDocument, document_id)
    if document is None:
        return
    base = await db.get(KnowledgeBase, document.knowledge_base_id)
    assert base is not None
    try:
        embedder = await provider(db, base.company_id)
        pages = await _load_pages(db, document, base.company_id)
        chunks = chunk_pages(pages)
        vectors = await _embed_cached(db, embedder, [c.content for c in chunks]) if chunks else []
    except Exception as exc:
        document.status = "failed"
        document.error = str(exc)[:500]
        await emit(db, "knowledge.indexed", {"document_id": document.id, "status": "failed", "error": document.error})
        return
    await db.execute(delete(KbChunk).where(KbChunk.kb_document_id == document.id))
    for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True)):
        db.add(
            KbChunk(
                kb_document_id=document.id,
                chunk_index=index,
                content=chunk.content,
                page=chunk.page,
                meta={"heading": chunk.heading},
                embedding_model=embedder.key,
                embedding=vector,
            )  # fmt: skip
        )
    document.status = "indexed"
    document.error = ""
    document.embedding_model = embedder.key
    document.indexed_at = utcnow()
    await db.flush()
    await emit(db, "knowledge.indexed", {"document_id": document.id, "status": "indexed", "base_id": base.id})


async def documents_to_reindex(db: AsyncSession, base_id: uuid.UUID) -> list[uuid.UUID]:
    stmt = select(KbDocument).where(KbDocument.knowledge_base_id == base_id)
    found = list((await db.execute(stmt)).scalars())
    for document in found:
        document.status = "pending"
    await db.flush()
    return [d.id for d in found]


async def all_documents(db: AsyncSession, company_id: uuid.UUID) -> list[uuid.UUID]:
    stmt = (
        select(KbDocument.id)
        .join(KnowledgeBase, KnowledgeBase.id == KbDocument.knowledge_base_id)
        .where(KnowledgeBase.company_id == company_id)
    )
    return list((await db.execute(stmt)).scalars())


async def retrieve(
    db: AsyncSession, company_id: uuid.UUID, bases: list[KnowledgeBase], query: str, limit: int | None = None
) -> list[Fragment]:
    embedder = await provider(db, company_id)
    vector = (await _embed_cached(db, embedder, [query]))[0]
    return await retriever.search(db, bases, query, vector, embedder.key, limit)


async def retrieve_for_agent(
    db: AsyncSession, agent: Any, query: str, scope: str | None = None, limit: int | None = None
) -> list[Fragment]:
    return await retrieve(db, agent.company_id, await readable_bases(db, agent.id, scope), query, limit)


async def query_base(db: AsyncSession, base: KnowledgeBase, query: str) -> list[dict[str, Any]]:
    fragments = await retrieve(db, base.company_id, [base], query)
    return [f.citation(i) for i, f in enumerate(fragments, start=1)]


async def chunks_by_id(db: AsyncSession, chunk_ids: list[uuid.UUID]) -> list[dict[str, Any]]:
    if not chunk_ids:
        return []
    stmt = (
        select(KbChunk, KbDocument)
        .join(KbDocument, KbDocument.id == KbChunk.kb_document_id)
        .where(KbChunk.id.in_(chunk_ids))
    )
    return [{"id": c.id, "document": d.title, "page": c.page, "content": c.content[:400]} for c, d in await db.execute(stmt)]


async def publish_module_sources(
    db: AsyncSession, company_id: uuid.UUID, rooms: list[tuple[Any, list[Any]]]
) -> list[uuid.UUID]:
    """Publica lo que declara cada módulo de sala en la base de su sala (RF-CON-05)."""
    published = []
    for room, modules in rooms:
        base = await ensure_base(db, company_id, "room", room.id, f"Conocimiento de {room.name}")
        for module in modules:
            plugin = plugins.modules().get(module.module_key)
            for source in plugin.knowledge_sources() if plugin else []:
                content = await source.build(db, company_id)
                document = await upsert_source(db, base, f"module:{module.module_key}:{source.title}", source.title, content)
                published.append(document.id)
    await audit_service.record(db, company_id, "system", "knowledge.published", "", {"documents": len(published)})
    return published
