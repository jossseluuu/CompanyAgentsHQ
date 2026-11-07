import io
import json
import zipfile

import pytest
from sqlalchemy import text

from app.core.db import Base, get_engine
from tests.conftest import Api, agent_id, room_id, settle


async def exported(api: Api) -> bytes:
    return (await api.request("GET", "/company/export", 200)).content


async def wipe_company() -> None:
    names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables if t.name not in {"owners", "auth_sessions"})
    async with get_engine().begin() as conn:
        await conn.execute(text("set session_replication_role = replica"))
        await conn.execute(text(f"truncate {names} cascade"))
        await conn.execute(text("set session_replication_role = origin"))


def upload(data: bytes) -> dict:
    return {"files": {"file": ("empresa.zip", data, "application/zip")}}


async def test_export_and_import_restore_the_whole_company(api: Api) -> None:
    room = await room_id(api, "finanzas")
    data = b"El presupuesto anual es de 73400 euros"
    stored = (await api.request("POST", f"/rooms/{room}/files", 201, files={"file": ("cuentas.md", data)})).json()
    await settle()
    task = await api.post("/tasks", {"title": "Revisar cuentas", "agent_id": await agent_id(api, "cfo")})
    await settle()
    agents = await api.get("/agents")
    office = await api.get("/office")

    archive = await exported(api)
    await settle()
    await wipe_company()
    assert not (await api.get("/company/exists"))["exists"]

    await api.request("POST", "/company/import", 201, **upload(archive))
    await settle()

    assert [a["id"] for a in await api.get("/agents")] == [a["id"] for a in agents]
    assert len((await api.get("/office"))["rooms"]) == len(office["rooms"])
    assert (await api.get(f"/tasks/{task['id']}"))["title"] == "Revisar cuentas"
    assert (await api.request("GET", f"/files/{stored['id']}", 200)).content == data
    assert (await api.get("/audit/verify"))["valid"] is True
    bases = await api.get("/knowledge-bases")
    base = next(b for b in bases if b["scope"] == "room" and b["scope_id"] == room)
    found = await api.post(f"/knowledge-bases/{base['id']}/query", {"query": "presupuesto anual"})
    assert "73400" in found[0]["fragment"]


async def test_import_is_refused_when_the_owner_already_has_a_company(api: Api) -> None:
    await api.request("POST", "/company/import", 409, **upload(await exported(api)))


async def test_import_rejects_foreign_files_and_path_tricks(owner: Api) -> None:
    await owner.request("POST", "/company/import", 422, **upload(b"no soy un zip"))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("manifest.json", json.dumps({"format": 99}))
    await owner.request("POST", "/company/import", 422, **upload(buffer.getvalue()))


async def test_import_rejects_a_storage_key_outside_the_company(api: Api) -> None:
    room = await room_id(api, "finanzas")
    await api.request("POST", f"/rooms/{room}/files", 201, files={"file": ("a.md", b"hola")})
    source = zipfile.ZipFile(io.BytesIO(await exported(api)))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as target:
        for name in source.namelist():
            content = source.read(name)
            if name == "data/files.json":
                files = json.loads(content)
                files[0]["storage_key"] = "../../fuera.txt"
                content = json.dumps(files).encode()
            target.writestr(name, content)
    await wipe_company()
    await api.request("POST", "/company/import", 422, **upload(buffer.getvalue()))
    assert not (await api.get("/company/exists"))["exists"]


async def test_company_is_deleted_with_all_its_data(api, tmp_path) -> None:  # type: ignore[no-untyped-def]
    import sqlalchemy as sa

    from app.core.db import Base, session_scope
    from app.domains.files import service as files_service
    from tests.conftest import agent_id, room_id, settle

    room = await room_id(api, "finanzas")
    response = await api.request("POST", f"/rooms/{room}/files", 201, files={"file": ("nota.md", b"secreto", "text/markdown")})
    await api.post("/tasks", {"title": "T", "agent_id": await agent_id(api, "redactor")})
    await settle()
    async with session_scope() as db:
        key = (await db.execute(sa.text("select storage_key from files limit 1"))).scalar_one()
    stored = files_service.storage()
    assert await stored.get(key) == b"secreto"
    assert response.status_code == 201

    wrong_name = {"confirm_name": "Otra", "password": "contraseña-1"}
    await api.request("DELETE", "/company", 422, json=wrong_name)
    wrong_password = {"confirm_name": "Acme", "password": "mala"}
    await api.request("DELETE", "/company", 401, json=wrong_password)
    assert (await api.get("/company/exists"))["exists"] is True

    body = {"confirm_name": "Acme", "password": "contraseña-1"}
    await api.request("DELETE", "/company", 200, json=body)
    async with session_scope() as db:
        for table in Base.metadata.sorted_tables:
            if table.name not in {"owners", "auth_sessions"}:
                count = (await db.execute(sa.select(sa.func.count()).select_from(table))).scalar_one()
                assert count == 0, table.name
    with pytest.raises(FileNotFoundError):
        await stored.get(key)
    assert (await api.get("/company/exists"))["exists"] is False

    await api.post("/company", {"name": "Nueva", "mission": "Otra vez", "template": "default"})
    assert (await api.get("/audit/verify"))["valid"] is True


async def test_audit_stays_protected_outside_a_company_deletion(api) -> None:  # type: ignore[no-untyped-def]
    import sqlalchemy as sa

    from app.core.db import session_scope

    with pytest.raises(sa.exc.DBAPIError):
        async with session_scope() as db:
            await db.execute(sa.text("select set_config('app.purge_company', 'otra-empresa', true)"))
            await db.execute(sa.text("delete from audit_events"))
