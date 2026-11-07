import random
import uuid
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select

from app.core.db import session_scope
from app.core.models import RealtimeEvent
from app.domains.agents.models import Agent
from app.domains.company.models import Company
from app.domains.knowledge import embeddings
from app.domains.office import furniture_catalog
from app.domains.office import service as office_service
from tests.conftest import Api, agent_id, room_id, settle

LIST = Path(__file__).resolve().parents[1] / "seeds" / "role_list.txt"


async def office_room(api: Api, slug: str) -> dict:
    office = await api.get("/office")
    return next(r for r in office["rooms"] if r["slug"] == slug)


def free_row(room: dict, length: int, seats: set[tuple[int, int]]) -> tuple[int, int]:
    """Primer tramo libre de una fila, lejos de las puertas."""
    taken = set(seats)
    for item in room["furniture"]:
        crossed = item["rotation"] % 180 == 90
        width, depth = (item["depth"], item["width"]) if crossed else (item["width"], item["depth"])
        taken |= {(item["grid_x"] + i, item["grid_y"] + j) for i in range(width) for j in range(depth)}
    for y in range(room["grid_y"] + 1, room["grid_y"] + room["height"] - 1):
        for x in range(room["grid_x"] + 1, room["grid_x"] + room["width"] - length):
            tiles = {(x + i, y) for i in range(length)}
            near_door = any(max(abs(a - dx), abs(b - dy)) <= 1 for a, b in tiles for dx, dy in room["doors"])
            if not tiles & taken and not near_door:
                return x, y
    raise AssertionError("sin hueco")


async def seats(api: Api) -> set[tuple[int, int]]:
    return {(a["seat_x"], a["seat_y"]) for a in await api.get("/agents")}


async def test_catalog_offers_sizes_and_styles(api: Api) -> None:
    catalog = {entry["key"]: entry for entry in await api.get("/furniture/catalog")}
    assert [3, 1] in catalog["desk"]["sizes"]
    assert [2, 1] in catalog["filing_cabinet"]["sizes"]
    assert "dark" in catalog["desk"]["variants"]


async def test_wide_furniture_occupies_all_its_tiles(api: Api) -> None:
    room = await office_room(api, "sala-descanso")
    x, y = free_row(room, 3, await seats(api))
    body = {"model_key": "desk", "grid_x": x, "grid_y": y, "width": 3, "depth": 1, "variant": "dark"}
    item = await api.post(f"/rooms/{room['id']}/furniture", body)
    assert (item["width"], item["depth"], item["variant"]) == (3, 1, "dark")
    on_top = {"model_key": "plant", "grid_x": x + 2, "grid_y": y}
    await api.request("POST", f"/rooms/{room['id']}/furniture", 409, json=on_top)


async def test_size_and_style_must_exist(api: Api) -> None:
    room = await office_room(api, "sala-descanso")
    x, y = free_row(room, 1, await seats(api))
    wrong_size = {"model_key": "lamp", "grid_x": x, "grid_y": y, "width": 3, "depth": 1}
    await api.request("POST", f"/rooms/{room['id']}/furniture", 422, json=wrong_size)
    wrong_style = {"model_key": "lamp", "grid_x": x, "grid_y": y, "variant": "rococó"}
    await api.request("POST", f"/rooms/{room['id']}/furniture", 422, json=wrong_style)


async def test_furniture_can_grow_and_change_style(api: Api) -> None:
    room = await office_room(api, "sala-descanso")
    x, y = free_row(room, 3, await seats(api))
    item = await api.post(f"/rooms/{room['id']}/furniture", {"model_key": "sofa", "grid_x": x, "grid_y": y})
    changed = await api.patch(
        f"/furniture/{item['id']}", {"grid_x": x, "grid_y": y, "width": 3, "depth": 1, "variant": "vivid"}
    )
    assert (changed["width"], changed["variant"]) == (3, "vivid")


async def test_rotating_crosses_width_and_depth(api: Api) -> None:
    room = await api.post(
        "/rooms", {"name": "Taller", "slug": "taller", "grid_x": 1, "grid_y": 40, "width": 8, "height": 5}
    )
    body = {"model_key": "desk", "grid_x": 3, "grid_y": 43, "width": 3, "depth": 1}
    item = await api.post(f"/rooms/{room['id']}/furniture", body)
    # De pie ocuparía las filas 43 a 45, y la 44 ya es pared.
    url = f"/furniture/{item['id']}"
    await api.request("PATCH", url, 409, json={"grid_x": 3, "grid_y": 43, "rotation": 90})
    await api.request("PATCH", url, 200, json={"grid_x": 3, "grid_y": 41, "rotation": 90})


async def test_meeting_table_blocks_what_it_shows(api: Api) -> None:
    room = await office_room(api, "sala-juntas")
    table = next(f for f in room["furniture"] if f["model_key"] == "meeting_table")
    assert (table["width"], table["depth"]) == furniture_catalog.default_size("meeting_table")


async def test_rug_does_not_block_the_way(api: Api) -> None:
    room = await office_room(api, "sala-descanso")
    x, y = free_row(room, 1, await seats(api))
    await api.post(f"/rooms/{room['id']}/furniture", {"model_key": "rug", "grid_x": x, "grid_y": y})
    agent = await agent_id(api, "redactor")
    await api.request("PUT", f"/agents/{agent}/seat", 200, json={"grid_x": x, "grid_y": y})


async def test_door_cannot_open_against_a_wall(api: Api) -> None:
    west = await api.post(
        "/rooms", {"name": "Izquierda", "slug": "izq", "grid_x": 1, "grid_y": 40, "width": 6, "height": 6}
    )
    await api.post("/rooms", {"name": "Derecha", "slug": "der", "grid_x": 7, "grid_y": 40, "width": 6, "height": 6})
    await api.request("PATCH", f"/rooms/{west['id']}", 409, json={"doors": [[6, 42]]})
    await api.request("PATCH", f"/rooms/{west['id']}", 200, json={"doors": [[1, 42], [6, 42]]})


async def test_transfer_takes_seat_and_desk_to_the_new_room(api: Api) -> None:
    agent = await agent_id(api, "redactor")
    before = await api.get(f"/agents/{agent}")
    marketing = await office_room(api, "marketing")
    desks = sum(f["model_key"] == "desk" for f in marketing["furniture"])
    target = await room_id(api, "finanzas")
    await api.patch(f"/agents/{agent}", {"home_room_id": target})
    after = await api.get(f"/agents/{agent}")
    room = await office_room(api, "finanzas")
    assert after["home_room_id"] == target
    assert (after["seat_x"], after["seat_y"]) != (before["seat_x"], before["seat_y"])
    assert room["grid_x"] < after["seat_x"] < room["grid_x"] + room["width"] - 1
    assert room["grid_y"] < after["seat_y"] < room["grid_y"] + room["height"] - 1
    left = await office_room(api, "marketing")
    assert sum(f["model_key"] == "desk" for f in left["furniture"]) == desks - 1


async def test_seat_can_be_placed_by_hand(api: Api) -> None:
    agent = await agent_id(api, "redactor")
    room = await office_room(api, "sala-descanso")
    x, y = free_row(room, 1, await seats(api))
    moved = await api.request("PUT", f"/agents/{agent}/seat", 200, json={"grid_x": x, "grid_y": y})
    assert (moved.json()["seat_x"], moved.json()["seat_y"], moved.json()["home_room_id"]) == (x, y, room["id"])
    await api.request("PUT", f"/agents/{agent}/seat", 409, json={"grid_x": 0, "grid_y": 0})


async def test_wide_desk_can_be_removed(api: Api) -> None:
    room = await office_room(api, "marketing")
    desk = next(f for f in room["furniture"] if f["model_key"] == "desk")
    await api.request("DELETE", f"/furniture/{desk['id']}", 204)


async def test_preview_shows_exactly_what_the_model_receives(api: Api) -> None:
    agent = await agent_id(api, "cfo")
    await api.patch(f"/agents/{agent}", {"personality": "Seca"})
    preview = await api.get(f"/agents/{agent}/prompt-preview")
    assert preview["system"] == "\n\n".join(layer["text"] for layer in preview["layers"])
    assert {"base", "company", "personality", "rules", "security"} == {layer["source"] for layer in preview["layers"]}
    assert "read_finance" in [tool["name"] for tool in preview["tools"]]


async def test_trace_context_and_default_prompt_are_visible(api: Api) -> None:
    agent = await agent_id(api, "cfo")
    await api.post(f"/agents/{agent}/messages", {"content": "Hola"})
    await settle()
    trace = (await api.get(f"/agents/{agent}/profile"))["audit"]["traces"][0]
    detail = await api.get(f"/agents/{agent}/traces/{trace['id']}")
    assert "Reglas de trabajo" in detail["context"]["system"]
    other = await agent_id(api, "cmo")
    await api.request("GET", f"/agents/{other}/traces/{trace['id']}", 404)
    assert (await api.get(f"/agents/{agent}/default-prompt"))["system_prompt"]
    assert (await api.get("/role-catalog/default-prompt", params={"role": "cao"}))["system_prompt"]
    catalog = await api.get("/tools/catalog")
    assert any(tool["sensitive"] for tool in catalog)
    assert all(tool["group"] != "other" for tool in catalog), "toda herramienta debe tener grupo"
    assert all(tool["core"] or tool["module_keys"] for tool in catalog), "toda herramienta debe poder activarse"


async def access_of(api: Api, room: str, agent: str) -> dict:
    return next(a for a in await api.get(f"/rooms/{room}/access") if a["agent_id"] == agent)


async def test_room_access_shows_the_rule_and_can_be_cleared(api: Api) -> None:
    room, agent = await room_id(api, "finanzas"), await agent_id(api, "redactor")
    assert (await access_of(api, room, agent))["custom"] is False
    body = {"agent_id": agent, "can_enter": True, "can_use_tools": False}
    await api.request("PUT", f"/rooms/{room}/access", 200, json=body)
    state = await access_of(api, room, agent)
    assert (state["custom"], state["can_enter"], state["can_use_tools"]) == (True, True, False)
    await api.request("DELETE", f"/rooms/{room}/access/{agent}", 204)
    state = await access_of(api, room, agent)
    assert (state["custom"], state["can_use_tools"]) == (False, True)
    events = await api.get("/audit/events")
    assert {"room.access_changed", "room.access_cleared"} <= {e["type"] for e in events}


async def test_home_room_cannot_be_denied(api: Api) -> None:
    room, agent = await room_id(api, "finanzas"), await agent_id(api, "cfo")
    deny = {"agent_id": agent, "can_enter": False, "can_use_tools": False}
    await api.request("PUT", f"/rooms/{room}/access", 409, json=deny)
    assert (await access_of(api, room, agent))["home"] is True


async def test_denied_agent_does_not_walk_in(api: Api) -> None:
    room, agent = await room_id(api, "sala-descanso"), await agent_id(api, "redactor")
    deny = {"agent_id": agent, "can_enter": False, "can_use_tools": False}
    await api.request("PUT", f"/rooms/{room}/access", 200, json=deny)
    async with session_scope() as db:
        row = await db.get(Agent, uuid.UUID(agent))
        before = (row.pos_x, row.pos_y)
        await office_service.walk(db, row, "break", "resting")
        assert (row.pos_x, row.pos_y) == before
    await settle()


async def test_agent_inside_leaves_when_denied(api: Api) -> None:
    room, agent = await room_id(api, "sala-descanso"), await agent_id(api, "redactor")
    await api.request("PUT", f"/rooms/{room}/access", 200, json={"agent_id": agent})
    async with session_scope() as db:
        row = await db.get(Agent, uuid.UUID(agent))
        await office_service.walk(db, row, "break", "resting")
        assert row.current_room_id == uuid.UUID(room)
    await settle()
    deny = {"agent_id": agent, "can_enter": False, "can_use_tools": False}
    await api.request("PUT", f"/rooms/{room}/access", 200, json=deny)
    await settle()
    after = await api.get(f"/agents/{agent}")
    assert (after["pos_x"], after["pos_y"]) == (after["seat_x"], after["seat_y"])


async def live_a_while(rounds: int = 25, seed: int = 7) -> None:
    rng = random.Random(seed)
    office_service._strolling_until.clear()
    for _ in range(rounds):
        async with session_scope() as db:
            company = (await db.execute(select(Company))).scalars().first()
            await office_service.office_life(db, company, rng)
        office_service._strolling_until.clear()


async def test_idle_agents_walk_around_without_leaving_history(api: Api) -> None:
    before = {a["id"]: (a["pos_x"], a["pos_y"]) for a in await api.get("/agents")}
    await live_a_while()
    agents = await api.get("/agents")
    assert sum((a["pos_x"], a["pos_y"]) != before[a["id"]] for a in agents) >= len(agents) - 1
    assert await api.get(f"/agents/{agents[0]['id']}/path") == []
    async with session_scope() as db:
        stored = await db.execute(select(RealtimeEvent).where(RealtimeEvent.type.in_(["agent.strolled", "agent.chatter"])))
        assert stored.first() is None


async def test_strolling_respects_access_routine_and_switch(api: Api) -> None:
    room = await office_room(api, "sala-control")
    redactor, cfo = await agent_id(api, "redactor"), await agent_id(api, "cfo")
    await api.request("PUT", f"/agents/{cfo}/routine", 200, json={"resting": "workplace"})
    start = await api.get(f"/agents/{cfo}")
    for _ in range(3):
        await live_a_while(rounds=15, seed=_)
        walker = await api.get(f"/agents/{redactor}")
        inside_x = room["grid_x"] <= walker["pos_x"] < room["grid_x"] + room["width"]
        inside_y = room["grid_y"] <= walker["pos_y"] < room["grid_y"] + room["height"]
        assert not (inside_x and inside_y)
    assert (await api.get(f"/agents/{cfo}"))["pos_x"] == start["pos_x"]
    await api.patch("/company/ai", {"office_life": False})
    still = await api.get(f"/agents/{redactor}")
    await live_a_while()
    moved = await api.get(f"/agents/{redactor}")
    assert (moved["pos_x"], moved["pos_y"]) == (still["pos_x"], still["pos_y"])


async def test_busy_agent_stays_put(api: Api) -> None:
    agent = await agent_id(api, "redactor")
    await api.request("POST", f"/agents/{agent}/pause", 200)
    start = await api.get(f"/agents/{agent}")
    await live_a_while()
    after = await api.get(f"/agents/{agent}")
    assert (after["pos_x"], after["pos_y"]) == (start["pos_x"], start["pos_y"])


async def test_chat_model_is_refused_as_embeddings(api: Api, monkeypatch: pytest.MonkeyPatch) -> None:
    async def not_implemented(self: object, texts: list[str]) -> list[list[float]]:
        request = httpx.Request("POST", "http://localhost:11434/api/embed")
        raise httpx.HTTPStatusError("501", request=request, response=httpx.Response(501, request=request))

    monkeypatch.setattr(embeddings.OllamaEmbeddings, "embed", not_implemented)
    body = {"embeddings_provider": "ollama", "embedding_model": "qwen3.5:4b"}
    await api.request("PATCH", "/company/ai", 422, json=body)
    assert "embedding_model" not in (await api.get("/company/ai"))["settings"]


async def test_full_role_list_keeps_existing_roles(api: Api) -> None:
    groups = (await api.get("/role-catalog"))["groups"]
    roles = [role for group in groups for role in group["roles"]]
    assert len(groups) >= 25
    assert len({role["key"] for role in roles}) == len(roles)
    listed = [line for line in LIST.read_text(encoding="utf-8").splitlines() if " | " in line and line[0] != "#"]
    assert len(listed) == 646
    assert {line.split(" | ")[1] for line in listed} <= {role["code"] for role in roles}
    by_code = {role["code"]: role for role in roles}
    assert by_code["CFO"]["key"] == "cfo"
    assert by_code["GENCOU"]["key"] == "clo"
    assert by_code["PERPRA"]["title"] == "Personal en prácticas"
    assert "delegate_task" in by_code["DIRFIN"]["tools"] and "read_finance" in by_code["DIRFIN"]["tools"]
    assert "delegate_task" not in by_code["BECFIN"]["tools"]
    known = {tool["name"] for tool in await api.get("/tools/catalog")}
    assert all(set(role["tools"]) <= known for role in roles)


async def test_code_is_the_default_name_unless_another_is_given(api: Api) -> None:
    first = await api.post("/agents", {"role": "tecsop"})
    second = await api.post("/agents", {"role": "tecsop", "name": " "})
    named = await api.post("/agents", {"role": "tecsop", "name": "Marta"})
    assert [first["name"], second["name"], named["name"]] == ["TECSOP", "TECSOP 2", "Marta"]
    assert (await api.get("/agents"))[-1]["role"] == "tecsop"


async def test_new_areas_get_their_own_room_without_overlaps(api: Api) -> None:
    for role in ("presja", "dirhos", "dirtra", "dirtien", "dirfor", "dirterr", "jefequ", "tecpra", "dirman", "dirsef"):
        hired = await api.post("/agents", {"role": role})
        assert hired["home_room_id"]
        assert (hired["seat_x"], hired["seat_y"]) != (0, 0)
    rooms = (await api.get("/office"))["rooms"]
    for index, a in enumerate(rooms):
        for b in rooms[index + 1 :]:
            apart_x = a["grid_x"] + a["width"] <= b["grid_x"] or b["grid_x"] + b["width"] <= a["grid_x"]
            apart_y = a["grid_y"] + a["height"] <= b["grid_y"] or b["grid_y"] + b["height"] <= a["grid_y"]
            assert apart_x or apart_y
    prompt = (await api.get("/role-catalog/default-prompt", params={"role": "presja"}))["system_prompt"]
    assert "PRESJA" in prompt
