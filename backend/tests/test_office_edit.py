from app.core.util import drop_unsupported_citations
from app.domains.runtime.llm.base import LLMResponse
from app.domains.runtime.llm.router import fake
from tests.conftest import Api, agent_id, room_id, settle


async def office_room(api: Api, slug: str) -> dict:
    office = await api.get("/office")
    return next(r for r in office["rooms"] if r["slug"] == slug)


async def test_hired_role_gets_a_desk_in_front_of_its_seat(api: Api) -> None:
    agent = await api.post("/agents", {"name": "Lola", "role": "clo"})
    room = await office_room(api, "personas-legal")
    desks = [(f["grid_x"], f["grid_y"]) for f in room["furniture"] if f["model_key"] == "desk"]
    hired = await api.get(f"/agents/{agent['id']}")
    assert (hired["seat_x"], hired["seat_y"] - 1) in desks


async def test_create_rename_and_delete_room(api: Api) -> None:
    room = await api.post(
        "/rooms", {"name": "Taller", "slug": "taller", "grid_x": 1, "grid_y": 40, "width": 8, "height": 6}
    )
    assert room["doors"] == [[5, 40]]
    await api.request("PATCH", f"/rooms/{room['id']}", 200, json={"name": "Laboratorio"})
    assert (await office_room(api, "taller"))["name"] == "Laboratorio"
    await api.request("DELETE", f"/rooms/{room['id']}", 204)


async def test_rooms_cannot_overlap(api: Api) -> None:
    body = {"name": "Encima", "slug": "encima", "grid_x": 2, "grid_y": 2, "width": 6, "height": 6}
    await api.request("POST", "/rooms", 409, json=body)
    marketing = await room_id(api, "marketing")
    await api.request("PATCH", f"/rooms/{marketing}", 409, json={"grid_x": 1})


async def test_moving_a_room_carries_furniture_seats_and_doors(api: Api) -> None:
    before = await office_room(api, "sala-control")
    target = await api.get("/office")
    bottom = max(r["grid_y"] + r["height"] for r in target["rooms"]) + 2
    dy = bottom - before["grid_y"]
    await api.request("PATCH", f"/rooms/{before['id']}", 200, json={"grid_y": bottom})
    after = await office_room(api, "sala-control")
    assert after["doors"][0][1] == before["doors"][0][1] + dy
    assert {f["grid_y"] for f in after["furniture"]} == {f["grid_y"] + dy for f in before["furniture"]}
    auditor = await api.get(f"/agents/{await agent_id(api, 'auditor')}")
    assert auditor["seat_y"] > bottom


async def test_resizing_keeps_door_on_its_wall_and_refuses_to_cut_content(api: Api) -> None:
    room = await office_room(api, "finanzas")
    await api.request("PATCH", f"/rooms/{room['id']}", 409, json={"width": 4, "height": 4})
    await api.request("PATCH", f"/rooms/{room['id']}", 200, json={"width": room["width"] + 3})
    assert (await office_room(api, "finanzas"))["doors"] == room["doors"]


async def test_furniture_moves_only_to_valid_tiles(api: Api) -> None:
    room = await office_room(api, "archivo-central")
    item = room["furniture"][0]
    other = room["furniture"][1]
    url = f"/furniture/{item['id']}"
    await api.request("PATCH", url, 409, json={"grid_x": 0, "grid_y": 0})
    await api.request("PATCH", url, 409, json={"grid_x": other["grid_x"], "grid_y": other["grid_y"]})
    tiles = {(f["grid_x"], f["grid_y"]) for f in room["furniture"]}
    door_x, door_y = room["doors"][0]
    seats = {(a["seat_x"], a["seat_y"]) for a in await api.get("/agents")}
    free = next(
        (x, y)
        for y in range(room["grid_y"] + 1, room["grid_y"] + room["height"] - 1)
        for x in range(room["grid_x"] + 1, room["grid_x"] + room["width"] - 1)
        if (x, y) not in tiles | seats and max(abs(x - door_x), abs(y - door_y)) > 1
    )
    moved = await api.request("PATCH", url, 200, json={"grid_x": free[0], "grid_y": free[1], "rotation": 90})
    assert (moved.json()["grid_x"], moved.json()["rotation"]) == (free[0], 90)


async def test_routine_can_be_read_and_changed(api: Api) -> None:
    agent = await agent_id(api, "redactor")
    options = await api.get(f"/agents/{agent}/routine")
    assert "resting" in options["defaults"]
    await api.request("PUT", f"/agents/{agent}/routine", 200, json={"resting": "workplace"})
    assert (await api.get(f"/agents/{agent}/routine"))["rules"] == {"resting": "workplace"}


def test_unsupported_citations_and_their_reference_block_are_removed() -> None:
    text = "Soy la CFO [1].\n\n**Referencias:**\n[1] *Herramientas permitidas*."
    assert drop_unsupported_citations(text, set()) == "Soy la CFO."
    assert drop_unsupported_citations("Dato [1] y otro [7].", {1}) == "Dato [1] y otro."


async def test_chat_without_documents_shows_no_invented_citation(api: Api) -> None:
    answer = "Soy la CFO [1].\n\n**Referencias:**\n[1] Inventada."
    fake.push(LLMResponse(answer, [], [{"type": "text", "text": answer}], 1, 1, "fake"))
    agent = await agent_id(api, "cfo")
    await api.post(f"/agents/{agent}/messages", {"content": "Hola"})
    await settle()
    last = (await api.get(f"/agents/{agent}/messages"))[-1]
    assert last["content"] == "Soy la CFO."


async def test_departments_can_be_managed(api: Api) -> None:
    created = await api.post("/company/departments", {"name": "Legal", "color": "#a855f7"})
    await api.patch(f"/company/departments/{created['id']}", {"name": "Jurídico", "color": "#a855f7"})
    assert "Jurídico" in [d["name"] for d in await api.get("/company/departments")]
    await api.request("DELETE", f"/company/departments/{created['id']}", 204)
    occupied = next(d for d in await api.get("/company/departments") if d["name"] == "Finanzas")
    await api.request("DELETE", f"/company/departments/{occupied['id']}", 409)


async def test_furniture_can_be_added_and_removed(api: Api) -> None:
    room = await office_room(api, "sala-descanso")
    tile = {"grid_x": room["grid_x"] + 12, "grid_y": room["grid_y"] + 4}
    item = await api.post(f"/rooms/{room['id']}/furniture", {"model_key": "plant", **tile})
    await api.request("POST", f"/rooms/{room['id']}/furniture", 409, json={"model_key": "lamp", **tile})
    await api.request("POST", f"/rooms/{room['id']}/furniture", 422, json={"model_key": "nave", **tile})
    await api.request("DELETE", f"/furniture/{item['id']}", 204)
    interactive = next(f for f in (await office_room(api, "finanzas"))["furniture"] if f["interactive"])
    await api.request("DELETE", f"/furniture/{interactive['id']}", 409)


async def test_doors_must_be_on_a_wall(api: Api) -> None:
    room = await office_room(api, "marketing")
    inside = [room["grid_x"] + 2, room["grid_y"] + 2]
    await api.request("PATCH", f"/rooms/{room['id']}", 422, json={"doors": [inside]})
    side = [room["grid_x"], room["grid_y"] + 3]
    await api.request("PATCH", f"/rooms/{room['id']}", 200, json={"doors": [side]})
