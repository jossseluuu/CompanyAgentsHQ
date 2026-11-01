import io
import json
import zipfile

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
