import csv
import io
from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.core.config import get_settings
from app.core.db import get_engine, session_scope
from app.domains.agents.models import Agent
from app.domains.runtime import service as runtime_service
from app.domains.runtime.llm.router import fake
from tests.conftest import Api, agent_id, room_id, settle


async def make_events(api: Api) -> None:
    await api.post("/tasks", {"title": "T", "agent_id": await agent_id(api, "redactor")})
    await settle()


async def test_audit_is_insert_only(api: Api) -> None:
    await make_events(api)
    for statement in ("update audit_events set actor = 'x'", "delete from audit_events", "truncate audit_events"):
        with pytest.raises(DBAPIError):
            async with get_engine().begin() as conn:
                await conn.execute(text(statement))


async def test_tampering_is_detected(api: Api) -> None:
    await make_events(api)
    assert (await api.get("/audit/verify"))["valid"] is True
    async with get_engine().begin() as conn:
        await conn.execute(text("set session_replication_role = replica"))
        await conn.execute(
            text("update audit_events set target = 'manipulado' where seq = (select min(seq) + 2 from audit_events)")
        )
        await conn.execute(text("set session_replication_role = origin"))
    verdict = await api.get("/audit/verify")
    assert verdict["valid"] is False and verdict["broken_at_seq"]
    from app.domains.audit import anomalies
    from app.domains.company.models import Company

    async with session_scope() as db:
        company = (await db.execute(select(Company))).scalar_one()
        await anomalies.check_integrity(db, company.id)
    found = await api.get("/audit/anomalies?status=open")
    assert found[0]["rule"] == "integridad" and found[0]["severity"] == "critical"
    await api.patch(f"/audit/anomalies/{found[0]['id']}", {"status": "resolved"})
    assert await api.get("/audit/anomalies?status=open") == []


async def test_filters_and_exports(api: Api) -> None:
    await make_events(api)
    agent = await agent_id(api, "redactor")
    filtered = await api.get(f"/audit/events?agent={agent}&type=llm")
    assert filtered and all(e["actor"] == agent for e in filtered)
    today = datetime.now(UTC).date().isoformat()
    assert await api.get(f"/audit/events?from={today}T00:00:00Z")
    exported = (await api.request("GET", "/audit/export?format=csv", 200)).text
    rows = list(csv.DictReader(io.StringIO(exported)))
    assert rows and rows[0]["hash"]
    assert (await api.request("GET", "/audit/export?format=json", 200)).json()


async def test_uncited_figures_are_flagged(api: Api) -> None:
    from app.domains.runtime.llm.base import LLMResponse

    answer = "El coste será de 5.000 €."
    fake.push(LLMResponse(answer, [], [{"type": "text", "text": answer}], 1, 1, "fake"))
    await make_events(api)
    assert any(a["rule"] == "sin_citas" for a in await api.get("/audit/anomalies"))


async def test_finance_import_budget_and_dashboard(api: Api) -> None:
    data = "fecha;categoria;importe;tipo\n{d};Ventas;1.200,50;ingreso\n{d};Software;-300;gasto\n".format(
        d=datetime.now(UTC).date().isoformat()
    )
    response = await api.request("POST", "/finance/entries/import", 201, files={"file": ("mov.csv", data.encode())})
    assert response.json()["imported"] == 2
    period = datetime.now(UTC).strftime("%Y-%m")
    await api.post("/finance/budgets", {"category": "Software", "period": period, "amount_eur": 500})
    await make_events(api)
    board = await api.get("/finance/dashboard")
    assert board["income_eur"] == 1200.5 and board["expense_eur"] == 300
    assert board["budget_vs_real"] == [{"category": "Software", "budget_eur": 500.0, "real_eur": 300.0}]
    assert board["ai_eur"] > 0 and board["ai_by_day"] and board["ai_by_agent"]
    assert await api.get("/costs?group_by=day")


async def test_bad_csv_is_rejected(api: Api) -> None:
    response = await api.request(
        "POST", "/finance/entries/import", 422, files={"file": ("m.csv", b"fecha,importe\nayer,x\n")}
    )
    assert "Fila 2" in response.json()["error"]["message"]


async def test_dashboard_publishes_knowledge_for_cfo(api: Api) -> None:
    data = f"fecha,categoria,importe,tipo\n{datetime.now(UTC).date().isoformat()},Ventas,1000,ingreso\n"
    await api.request("POST", "/finance/entries/import", 201, files={"file": ("m.csv", data.encode())})
    published = await api.post("/knowledge-publish")
    assert published["published"] == 1
    await settle()
    cfo = await agent_id(api, "cfo")
    await api.post(f"/agents/{cfo}/messages", {"content": "ingresos del mes"})
    await settle()
    assert (await api.get(f"/agents/{cfo}/messages"))[-1]["citations"][0]["document"] == "Resumen financiero"


async def test_idle_agent_rests_and_consolidates(api: Api) -> None:
    settings = get_settings()
    redactor = await agent_id(api, "redactor")
    for index in range(3):
        await api.post("/tasks", {"title": f"T{index}", "agent_id": redactor})
        await settle()
    assert len((await api.get(f"/agents/{redactor}/profile"))["memory"]) == 3
    previous, settings.idle_rest_seconds = settings.idle_rest_seconds, 0
    try:
        await runtime_service.tick_all()
        await settle()
    finally:
        settings.idle_rest_seconds = previous
    agent = await api.get(f"/agents/{redactor}")
    assert agent["status"] == "resting" and agent["steps_since_rest"] == 0
    async with session_scope() as db:
        row = (await db.execute(select(Agent).where(Agent.role == "redactor"))).scalar_one()
    room = await room_id(api, "sala-descanso")
    assert str(row.current_room_id) == room
    memory = (await api.get(f"/agents/{redactor}/profile"))["memory"]
    assert len(memory) == 1 and "Resumen" in memory[0]["summary"]
    types = {e["type"] for e in await api.get("/audit/events?type=memory")}
    assert types == {"memory.consolidated"}


async def test_profile_has_all_tabs(api: Api) -> None:
    await make_events(api)
    profile = await api.get(f"/agents/{await agent_id(api, 'redactor')}/profile")
    assert set(profile) >= {"agent", "profile", "capabilities", "knowledge", "work", "performance", "cost",
                            "memory", "audit"}  # fmt: skip
    assert profile["performance"]["completed"] == 1
    assert profile["performance"]["accepted_first_pct"] == 100
    assert profile["cost"]["by_day"] and profile["cost"]["tokens"]["input"] > 0
    assert "search_files" in profile["capabilities"]["usable_now"]
    assert "read_audit" not in profile["capabilities"]["usable_now"]
    assert [k["scope"] for k in profile["knowledge"]].count("agent") == 1


async def test_memory_editable(api: Api) -> None:
    await make_events(api)
    redactor = await agent_id(api, "redactor")
    memory = (await api.get(f"/agents/{redactor}/profile"))["memory"][0]
    await api.patch(f"/agents/{redactor}/memories/{memory['id']}", {"summary": "Editado"})
    assert (await api.get(f"/agents/{redactor}/profile"))["memory"][0]["summary"] == "Editado"
    await api.request("DELETE", f"/agents/{redactor}/memories/{memory['id']}", 204)
    assert (await api.get(f"/agents/{redactor}/profile"))["memory"] == []


async def test_global_search(api: Api) -> None:
    room = await room_id(api, "marketing")
    await api.request("POST", f"/rooms/{room}/files", 201, files={"file": ("campaña.txt", b"navidad")})
    results = await api.post("/search", {"query": "navidad"})
    assert results["files"][0]["name"] == "campa_a.txt" or results["files"][0]["name"] == "campaña.txt"
    assert (await api.post("/search", {"query": "Gloria"}))["agents"][0]["role"] == "cfo"


async def test_meeting_produces_minutes(api: Api) -> None:
    participants = [await agent_id(api, "cmo"), await agent_id(api, "cto")]
    await api.post("/meetings", {"topic": "Lanzamiento", "participants": participants, "max_rounds": 1})
    await settle()
    meeting = (await api.get("/meetings"))[0]
    assert meeting["status"] == "done" and meeting["minutes_file_id"]
    assert meeting["transcript"].count("**") == 4


async def test_realtime_replay_after_reconnect(api: Api) -> None:
    from app.core.db import session_scope as scope
    from app.core.models import RealtimeEvent

    await make_events(api)
    async with scope() as db:
        events = list((await db.execute(select(RealtimeEvent).order_by(RealtimeEvent.seq))).scalars())
    assert [e.seq for e in events] == sorted(e.seq for e in events)
    assert {"agent.status", "task.updated", "file.created", "cost.updated"} <= {e.type for e in events}


async def test_health_and_openapi(api: Api) -> None:
    assert (await api.client.get("/health")).json() == {"status": "ok"}
    paths = (await api.client.get("/openapi.json")).json()["paths"]
    assert "/api/v1/goals/{goal_id}/approve-plan" in paths
    assert "/api/v1/knowledge-bases/{base_id}/query" in paths
