import uuid

from sqlalchemy import select

from app.core.db import session_scope
from app.domains.audit.models import AuditEvent, Trace
from app.domains.runtime import service as runtime_service
from app.domains.runtime.llm.base import LLMError
from app.domains.runtime.llm.router import fake
from tests.conftest import Api, agent_id, room_id, settle


async def give_goal(api: Api) -> dict:
    goal = await api.post("/goals", {"title": "Lanzar el boletín", "description": "Boletín mensual"})
    await settle()
    return await api.get(f"/goals/{goal['id']}")


async def test_goal_runs_to_completion(api: Api) -> None:
    """Criterio de la fase 3: objetivo, plan aprobado, jefes que revisan y todo auditado."""
    goal = await give_goal(api)
    assert goal["status"] == "plan_review"
    assert len(goal["plan"]["tasks"]) == 3
    await api.post(f"/goals/{goal['id']}/approve-plan", {})
    await settle()
    goal = await api.get(f"/goals/{goal['id']}")
    assert goal["status"] == "done"
    assert all(t["status"] == "done" for t in goal["tasks"])
    marketing = next(t for t in goal["tasks"] if t["title"] == "Plan de contenidos")
    assert marketing["children"][0]["status"] == "done"
    assert marketing["children"][0]["reviewer_agent_id"] == await agent_id(api, "cmo")
    assert marketing["reviewer_agent_id"] == await agent_id(api, "ceo")
    files = await api.get(f"/rooms/{await room_id(api, 'marketing')}/files")
    assert any(f["created_by_task_id"] == marketing["id"] for f in files)
    ceo_files = await api.get(f"/rooms/{await room_id(api, 'despacho-ceo')}/files")
    assert any(f["name"].startswith("informe-") for f in ceo_files)
    assert (await api.get("/audit/verify"))["valid"] is True
    types = {e["type"] for e in await api.get("/audit/events?limit=1000")}
    assert {"goal.created", "goal.plan_approved", "task.started", "tool.called", "llm.call", "task.reviewed",
            "task.done", "file.created"} <= types  # fmt: skip
    trace = await api.get(f"/tasks/{marketing['id']}/trace")
    assert trace[0]["model"] == "fake" and trace[0]["prompt_version"] == 1
    assert (await api.get("/company/status-bar"))["spend_today_eur"] > 0
    board = await api.get(f"/rooms/{await room_id(api, 'marketing')}/tasks")
    assert len(board["done"]) == 2


async def test_owner_rejects_plan(api: Api) -> None:
    goal = await give_goal(api)
    await api.post(f"/goals/{goal['id']}/reject-plan")
    assert (await api.get(f"/goals/{goal['id']}"))["status"] == "rejected"
    await api.post(f"/goals/{goal['id']}/approve-plan", {}, expected=409)


async def test_owner_edits_plan(api: Api) -> None:
    goal = await give_goal(api)
    plan = {"summary": "Solo finanzas", "tasks": [goal["plan"]["tasks"][2]]}
    await api.post(f"/goals/{goal['id']}/approve-plan", {"plan": plan})
    await settle()
    goal = await api.get(f"/goals/{goal['id']}")
    assert len(goal["tasks"]) == 1 and goal["status"] == "done"


async def manual_task(api: Api, role: str, instructions: str = "Haz algo", title: str = "Trabajo") -> dict:
    agent = await agent_id(api, role)
    return await api.post("/tasks", {"title": title, "instructions": instructions, "agent_id": agent})


async def test_supervisor_returns_work_and_agent_redoes_it(api: Api) -> None:
    task = await manual_task(api, "redactor", "[rechazar] Escribe el texto")
    await settle()
    found = await api.get(f"/tasks/{task['id']}")
    assert found["status"] == "done" and found["rejections"] == 1
    assert found["review_comment"]
    assert any("devuelve el trabajo" in str(r.messages) for r in fake.requests)


async def test_three_rejections_escalate_to_owner(api: Api) -> None:
    for _ in range(3):
        fake.push(fake.tool("review_decision", accept=False, comments="No"))
    from app.domains.runtime.llm.base import LLMResponse

    def done() -> LLMResponse:
        return LLMResponse("Texto", [], [{"type": "text", "text": "Texto"}], 1, 1, "fake")

    fake.forced.clear()
    fake.push(done(), fake.tool("review_decision", accept=False, comments="No"))
    fake.push(done(), fake.tool("review_decision", accept=False, comments="No"))
    fake.push(done(), fake.tool("review_decision", accept=False, comments="No"))
    task = await manual_task(api, "redactor")
    await settle()
    found = await api.get(f"/tasks/{task['id']}")
    assert found["status"] == "blocked" and found["rejections"] == 3
    pending = await api.get("/approvals?status=pending")
    assert pending[0]["action_type"] == "review_escalation"
    assert pending[0]["requester_name"] == "Diego"
    await api.post(f"/approvals/{pending[0]['id']}/decision", {"approve": True})
    await settle()
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"
    anomalies = await api.get("/audit/anomalies")
    assert any(a["rule"] == "rechazos" for a in anomalies)


async def test_sensitive_tool_waits_for_owner(api: Api) -> None:
    room = await room_id(api, "archivo-central")
    response = await api.request("POST", f"/rooms/{room}/files", 201, files={"file": ("borrar.txt", b"x")})
    file_id = response.json()["id"]
    fake.push(fake.tool("delete_file", file_id=file_id))
    task = await manual_task(api, "chief_of_staff")
    await settle()
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "blocked"
    assert len(await api.get(f"/rooms/{room}/files")) == 1
    assert (await api.get("/company/status-bar"))["pending_approvals"] == 1
    agent = await api.get(f"/agents/{await agent_id(api, 'chief_of_staff')}")
    assert agent["status"] == "waiting_approval"
    approval = (await api.get("/approvals?status=pending"))[0]
    await api.post(f"/approvals/{approval['id']}/decision", {"approve": True, "comment": "Vale"})
    await settle()
    assert "borrar.txt" not in [f["name"] for f in await api.get(f"/rooms/{room}/files")]
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"


async def test_rejected_action_is_not_executed(api: Api) -> None:
    room = await room_id(api, "archivo-central")
    response = await api.request("POST", f"/rooms/{room}/files", 201, files={"file": ("guardar.txt", b"x")})
    fake.push(fake.tool("delete_file", file_id=response.json()["id"]))
    task = await manual_task(api, "chief_of_staff")
    await settle()
    approval = (await api.get("/approvals?status=pending"))[0]
    await api.post(f"/approvals/{approval['id']}/decision", {"approve": False, "comment": "No"})
    await settle()
    names = [f["name"] for f in await api.get(f"/rooms/{room}/files")]
    assert "guardar.txt" in names
    assert "rechazada" in str(fake.requests[-2].messages) or "rechazada" in str(fake.requests[-1].messages)
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"
    await api.post(f"/approvals/{approval['id']}/decision", {"approve": True}, expected=409)


async def test_pre_approval_by_supervisor(api: Api) -> None:
    cmo, redactor = await agent_id(api, "cmo"), await agent_id(api, "redactor")
    await api.post("/supervisions", {"supervisor_id": cmo, "supervised_id": redactor, "kind": "pre_approval",
                                     "tools": ["write_file"]})  # fmt: skip
    fake.push(fake.tool("write_file", name="post.md", content="hola"))
    task = await manual_task(api, "redactor")
    await settle()
    decided = await api.get("/approvals")
    assert decided[0]["status"] == "approved"
    assert decided[0]["approver_agent_id"] == cmo
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"
    files = await api.get(f"/rooms/{await room_id(api, 'marketing')}/files")
    assert "post.md" in [f["name"] for f in files]


async def test_supervisor_can_escalate_to_owner(api: Api) -> None:
    cmo, redactor = await agent_id(api, "cmo"), await agent_id(api, "redactor")
    await api.post("/supervisions", {"supervisor_id": cmo, "supervised_id": redactor, "kind": "pre_approval",
                                     "tools": ["write_file"]})  # fmt: skip
    fake.push(
        fake.tool("write_file", name="post.md", content="hola"),
        fake.tool("decide", approve=False, escalate=True, comment="Tú"),
    )
    await manual_task(api, "redactor")
    await settle()
    assert (await api.get("/company/status-bar"))["pending_approvals"] == 1


async def test_denied_tool_is_logged_and_flagged(api: Api) -> None:
    for index in range(3):
        fake.push(fake.tool("read_audit", type=f"t{index}"))
    task = await manual_task(api, "redactor")
    await settle()
    events = await api.get("/audit/events?type=tool.denied")
    assert len(events) == 3
    assert any(a["rule"] == "permisos" for a in await api.get("/audit/anomalies"))
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"


async def test_loop_detection_pauses_agent(api: Api) -> None:
    for _ in range(3):
        fake.push(fake.tool("search_files", query="igual"))
    task = await manual_task(api, "redactor")
    await settle()
    redactor = await api.get(f"/agents/{await agent_id(api, 'redactor')}")
    assert redactor["status"] == "paused"
    assert any(a["rule"] == "bucle" for a in await api.get("/audit/anomalies"))
    assert (await api.get(f"/tasks/{task['id']}"))["blocked_reason"] == "agent_paused"
    await api.post(f"/agents/{redactor['id']}/resume")
    await settle()
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"


async def test_max_steps(api: Api) -> None:
    for index in range(16):
        fake.push(fake.tool("search_files", query=f"q{index}"))
    task = await manual_task(api, "redactor")
    await settle()
    found = await api.get(f"/tasks/{task['id']}")
    assert found["status"] == "failed" and "15 pasos" in found["error"]
    fake.forced.clear()
    await api.post(f"/tasks/{task['id']}/retry")
    await settle()
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"


async def test_delegation_only_to_direct_reports(api: Api) -> None:
    fake.push(fake.tool("delegate_task", to_role="desarrollador", title="X", instructions="Y"))
    await manual_task(api, "cmo")
    await settle()
    assert "subordinados directos" in str(fake.requests[-3].messages) + str(fake.requests[-2].messages) + str(
        fake.requests[-1].messages
    ) or any("subordinados directos" in str(r.messages) for r in fake.requests)


async def test_duplicate_delegation_blocked(api: Api) -> None:
    fake.push(
        fake.tool("delegate_task", to_role="redactor", title="X", instructions="Igual"),
        fake.tool("delegate_task", to_role="redactor", title="X", instructions="Igual"),
    )
    await manual_task(api, "cmo")
    await settle()
    tasks = [t for t in await api.get("/tasks") if t["instructions"] == "Igual"]
    assert len(tasks) == 1


async def test_budget_limit_pauses_agent_and_resumes(api: Api) -> None:
    await api.patch("/company", {"daily_budget_eur": 0})
    task = await manual_task(api, "redactor")
    await settle()
    assert (await api.get(f"/agents/{task['assigned_agent_id']}"))["status"] == "paused"
    assert (await api.get(f"/tasks/{task['id']}"))["blocked_reason"] == "budget"
    await api.patch("/company", {"daily_budget_eur": 5})
    await api.post(f"/agents/{task['assigned_agent_id']}/resume")
    await settle()
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"


async def test_budget_alert_notifications(api: Api) -> None:
    from app.domains.runtime.llm.base import LLMResponse

    await api.patch("/company", {"daily_budget_eur": "0.01"})
    fake.push(LLMResponse("Largo", [], [{"type": "text", "text": "Largo"}], 100000, 1, "fake"))
    await manual_task(api, "redactor")
    await settle()
    titles = [n["title"] for n in await api.get("/notifications")]
    assert any("100 %" in t for t in titles)


async def test_provider_down_pauses_but_office_stays_usable(api: Api) -> None:
    fake.push(*[LLMError("caído", retryable=True) for _ in range(4)])
    task = await manual_task(api, "redactor")
    await settle()
    assert (await api.get(f"/tasks/{task['id']}"))["blocked_reason"] == "provider"
    assert (await api.get(f"/agents/{task['assigned_agent_id']}"))["status"] == "paused"
    await api.get("/company")
    await api.post(f"/agents/{task['assigned_agent_id']}/resume")
    await settle()
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"


async def test_transient_provider_error_retries(api: Api) -> None:
    fake.push(LLMError("429", retryable=True), LLMError("500", retryable=True))
    task = await manual_task(api, "redactor")
    await settle()
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"


async def test_cancel_and_company_pause(api: Api) -> None:
    await api.post("/company/pause")
    task = await manual_task(api, "redactor")
    await settle()
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "pending"
    await api.post("/company/resume")
    await settle()
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"
    await api.post("/company/pause")
    other = await manual_task(api, "redactor")
    await api.post(f"/tasks/{other['id']}/cancel")
    assert (await api.get(f"/tasks/{other['id']}"))["status"] == "cancelled"
    await api.post(f"/tasks/{task['id']}/cancel", expected=409)


async def test_tasks_survive_restart(api: Api) -> None:
    """RNF-FIA-01: una tarea a medias se retoma con su conversación."""
    await api.post("/company/pause")
    task = await manual_task(api, "redactor")
    await settle()
    async with session_scope() as db:
        from app.domains.agents.models import Agent
        from app.domains.tasks.models import Task

        row = await db.get(Task, uuid.UUID(task["id"]))
        row.status = "in_progress"
        row.conversation = [{"role": "user", "content": "Empieza"}]
        agent = await db.get(Agent, row.assigned_agent_id)
        agent.current_task_id = row.id
    await api.post("/company/resume")
    assert await runtime_service.recover(lease_seconds=0) == 1
    await settle()
    assert (await api.get(f"/tasks/{task['id']}"))["status"] == "done"


async def test_concurrent_reviews_do_not_deadlock(api: Api) -> None:
    """Regresión: varios trabajos revisados a la vez por el mismo jefe mantienen la cadena íntegra."""
    tasks = [
        await manual_task(api, role, title=f"T{i}") for i, role in enumerate(["cmo", "cto", "cfo", "chief_of_staff"] * 3)
    ]
    await settle()
    states = {(await api.get(f"/tasks/{t['id']}"))["status"] for t in tasks}
    assert states == {"done"}
    assert (await api.get("/audit/verify"))["valid"] is True


async def test_every_trace_keeps_model_prompt_and_rag(api: Api) -> None:
    await manual_task(api, "redactor")
    await settle()
    async with session_scope() as db:
        traces = list((await db.execute(select(Trace))).scalars())
        events = list((await db.execute(select(AuditEvent))).scalars())
    assert traces and all(t.model and t.prompt_version for t in traces)
    assert sum(1 for e in events if e.type == "llm.call") == len(traces)


async def test_dependencies_hold_a_task(api: Api) -> None:
    await api.post("/company/pause")
    first = await manual_task(api, "redactor", title="Primera")
    agent = await agent_id(api, "desarrollador")
    second = await api.post("/tasks", {"title": "Segunda", "agent_id": agent, "depends_on": [first["id"]]})
    await settle()
    await api.post(f"/tasks/{first['id']}/cancel")
    await api.post("/company/resume")
    await settle()
    assert (await api.get(f"/tasks/{second['id']}"))["status"] == "pending"
