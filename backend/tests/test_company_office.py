from sqlalchemy import select

from app.core.db import session_scope
from app.domains.agents.models import Agent
from app.domains.company.models import Company
from app.domains.office import service as office_service
from app.domains.office.pathfinding import find_path
from tests.conftest import Api, agent_id, room_id


async def test_template_creates_eight_rooms_and_agents(api: Api) -> None:
    data = await api.get("/company")
    assert len(data["office"]["rooms"]) == 8
    assert len(data["agents"]) == 8
    assert {a["role"] for a in data["agents"]} >= {"ceo", "cmo", "redactor", "cto", "cfo", "auditor"}
    finance = next(r for r in data["office"]["rooms"] if r["slug"] == "finanzas")
    assert {m["module_key"] for m in finance["modules"]} >= {"finance_dashboard", "filing_cabinet", "team"}
    assert any(f["interactive"] for f in finance["furniture"])


async def test_org_chart_and_observer(api: Api) -> None:
    roots = await api.get("/org-chart")
    names = {n["role"]: n for n in roots}
    assert set(names) == {"ceo", "auditor"}
    assert {r["role"] for r in names["ceo"]["reports"]} == {"cmo", "cto", "cfo", "chief_of_staff"}
    supervisions = await api.get("/supervisions")
    assert sum(1 for s in supervisions if s["kind"] == "observer") == 7


async def test_every_seat_and_break_room_is_reachable(api: Api) -> None:
    async with session_scope() as db:
        company = (await db.execute(select(Company))).scalar_one()
        width, height, blocked = await office_service.build_grid(db, company.id)
        agents = list((await db.execute(select(Agent))).scalars())
        rest = (await office_service.rooms_with_module(db, company.id, "break_area"))[0]
        center = (rest.grid_x + 5, rest.grid_y + 4)
        for agent in agents:
            seat = (agent.seat_x, agent.seat_y)
            assert seat not in blocked, agent.name
            assert find_path(width, height, blocked, seat, (0, 0)), agent.name
            assert find_path(width, height, blocked, seat, center), agent.name


async def test_edit_company_and_pause(api: Api) -> None:
    updated = await api.patch("/company", {"mission": "Nueva", "values": "Honestidad", "daily_budget_eur": 3})
    assert updated["mission"] == "Nueva"
    assert (await api.post("/company/pause"))["status"] == "paused"
    assert (await api.get("/company/status-bar"))["status"] == "paused"
    assert (await api.post("/company/resume"))["status"] == "active"


async def test_module_install_configure_uninstall(api: Api) -> None:
    room = await room_id(api, "sala-juntas")
    catalog = await api.get("/modules/catalog")
    assert any(m["key"] == "finance_dashboard" and "read_finance" in m["tools"] for m in catalog)
    await api.post(f"/rooms/{room}/modules", {"module_key": "filing_cabinet"})
    await api.patch(f"/rooms/{room}/modules/filing_cabinet", {"color": "gris"})
    details = await api.get(f"/rooms/{room}")
    module = next(m for m in details["modules"] if m["module_key"] == "filing_cabinet")
    assert module["config"]["color"] == "gris"
    await api.request("DELETE", f"/rooms/{room}/modules/filing_cabinet", 204)
    await api.request("POST", f"/rooms/{room}/modules", 404, json={"module_key": "no-existe"})


async def test_room_access_rule(api: Api) -> None:
    control = await room_id(api, "sala-control")
    cfo, auditor = await agent_id(api, "cfo"), await agent_id(api, "auditor")
    async with session_scope() as db:
        cfo_row, auditor_row = (
            await db.get(Agent, __import__("uuid").UUID(cfo)),
            await db.get(Agent, __import__("uuid").UUID(auditor)),
        )
        room = await office_service.get_room(db, cfo_row.company_id, __import__("uuid").UUID(control))
        assert not await office_service.can_enter(db, cfo_row, room)
        assert await office_service.can_enter(db, auditor_row, room)
    await api.request("PUT", f"/rooms/{control}/access", 200, json={"agent_id": cfo})
    async with session_scope() as db:
        cfo_row = await db.get(Agent, __import__("uuid").UUID(cfo))
        room = await office_service.get_room(db, cfo_row.company_id, __import__("uuid").UUID(control))
        assert await office_service.can_enter(db, cfo_row, room)


async def test_hired_agent_gets_a_reachable_seat(api: Api) -> None:
    room = await room_id(api, "marketing")
    created = await api.post("/agents", {"name": "Sara", "role": "seo", "home_room_id": room})
    found = await api.get(f"/agents/{created['id']}")
    assert (found["seat_x"], found["seat_y"]) != (0, 0)
    assert found["current_room_id"] == room


async def test_agent_lifecycle(api: Api) -> None:
    room = await room_id(api, "marketing")
    manager = await agent_id(api, "cmo")
    created = await api.post(
        "/agents", {"name": "Sara", "role": "seo", "home_room_id": room, "manager_id": manager, "seat_x": 15, "seat_y": 6}
    )
    identifier = created["id"]
    versions = await api.get(f"/agents/{identifier}/prompt-versions")
    assert versions[0]["version"] == 1
    await api.post(f"/agents/{identifier}/prompt-versions", {"system_prompt": "Otro prompt", "note": "cambio"})
    await api.post(f"/agents/{identifier}/prompt-versions", {"restore_version": 1})
    versions = await api.get(f"/agents/{identifier}/prompt-versions")
    assert [v["version"] for v in versions] == [3, 2, 1]
    assert versions[0]["system_prompt"] == versions[2]["system_prompt"]
    clone = await api.post(f"/agents/{identifier}/clone")
    assert clone["manager_id"] == manager
    cycle = await api.request("PATCH", f"/agents/{manager}", 422, json={"manager_id": identifier})
    assert cycle.json()["error"]["code"] == "hierarchy_cycle"
    await api.request("DELETE", f"/agents/{identifier}", 204)
    assert identifier not in [a["id"] for a in await api.get("/agents")]
    assert (await api.get(f"/agents/{identifier}"))["archived_at"]
