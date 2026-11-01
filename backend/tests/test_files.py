import io

from docx import Document

from tests.conftest import Api, agent_id, room_id


async def upload(api: Api, room: str, name: str, data: bytes, expected: int = 201) -> dict:
    response = await api.request("POST", f"/rooms/{room}/files", expected, files={"file": (name, data)})
    return response.json()


async def test_upload_preview_download_and_trash(api: Api) -> None:
    room = await room_id(api, "marketing")
    file = await upload(api, room, "notas.txt", b"Plan de marca para 2027")
    listed = await api.get(f"/rooms/{room}/files")
    assert [f["name"] for f in listed] == ["notas.txt"]
    preview = await api.request("GET", f"/files/{file['id']}?preview=true", 200)
    assert preview.headers["content-disposition"].startswith("inline")
    assert preview.headers["x-content-type-options"] == "nosniff"
    download = await api.request("GET", f"/files/{file['id']}", 200)
    assert download.headers["content-disposition"].startswith("attachment")
    assert download.content == b"Plan de marca para 2027"
    await api.request("DELETE", f"/files/{file['id']}", 204)
    assert await api.get(f"/rooms/{room}/files") == []
    assert len(await api.get(f"/rooms/{room}/files?trash=true")) == 1
    await api.post(f"/files/{file['id']}/restore")
    assert len(await api.get(f"/rooms/{room}/files")) == 1


async def test_rejects_bad_types_and_spoofed_content(api: Api) -> None:
    room = await room_id(api, "marketing")
    await upload(api, room, "virus.exe", b"MZ", 415)
    await upload(api, room, "falso.pdf", b"no soy un pdf", 415)
    await upload(api, room, "../../secreto.svg", b"<svg/>", 415)


async def test_size_limit(api: Api) -> None:
    from app.core.config import get_settings

    settings = get_settings()
    previous, settings.max_upload_mb = settings.max_upload_mb, 1
    try:
        await upload(api, await room_id(api, "marketing"), "grande.txt", b"x" * (1024 * 1024 + 1), 413)
    finally:
        settings.max_upload_mb = previous


async def test_filename_cannot_escape(api: Api) -> None:
    room = await room_id(api, "marketing")
    file = await upload(api, room, "..\\..\\evil.txt", b"hola")
    assert file["name"] == "evil.txt"


async def test_versions_move_copy_and_search(api: Api) -> None:
    marketing, finance = await room_id(api, "marketing"), await room_id(api, "finanzas")
    await upload(api, marketing, "plan.md", b"primera version")
    second = await upload(api, marketing, "plan.md", b"segunda version con facturacion")
    assert second["version"] == 2
    meta = await api.get(f"/files/{second['id']}/meta")
    assert len(meta["versions"]) == 2
    copied = (await api.request("POST", f"/files/{second['id']}/copy", 201, json={"room_id": finance})).json()
    await api.post(f"/files/{copied['id']}/move", {"room_id": marketing})
    found = await api.get("/files/search?q=facturacion")
    assert len(found) == 2
    assert "facturacion" in found[0]["snippet"]


async def test_filters_and_docx_text(api: Api) -> None:
    room = await room_id(api, "tecnologia")
    buffer = io.BytesIO()
    document = Document()
    document.add_paragraph("Arquitectura del sistema de pagos")
    document.save(buffer)
    await upload(api, room, "arq.docx", buffer.getvalue())
    await upload(api, room, "a.txt", b"x")
    assert [f["name"] for f in await api.get(f"/rooms/{room}/files?ext=docx")] == ["arq.docx"]
    assert (await api.get(f"/rooms/{room}/files?sort=name&desc=false"))[0]["name"] == "a.txt"
    assert await api.get("/files/search?q=pagos")
    assert await agent_id(api, "cto")
