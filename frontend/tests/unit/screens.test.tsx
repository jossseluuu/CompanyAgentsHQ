import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import type { Agent, Room, RoomModule, Snapshot } from "@/api/types";
import { AgentProfile } from "@/features/agent-profile/AgentProfile";
import { ApprovalsPage } from "@/features/approvals/ApprovalsPage";
import { AuditPage } from "@/features/audit/AuditPage";
import { LoginPage, OnboardingPage } from "@/features/auth/AuthPages";
import { GoalsPage } from "@/features/goals/GoalsPage";
import { KnowledgePage } from "@/features/knowledge/KnowledgePage";
import { NotificationsButton } from "@/features/notifications/Notifications";
import { OrgChartPage } from "@/features/org-chart/OrgChartPage";
import { RoomPanel } from "@/features/room/RoomPanel";
import { SearchDialog } from "@/features/search/SearchDialog";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { MODULE_PANELS } from "@/modules/registry";
import { FlatMap } from "@/office/FlatMap";
import { useOffice } from "@/store/office";

const agent = { id: "a1", name: "Gloria", role: "cfo", status: "resting", tools: ["read_file"], home_room_id: "r1", pause_reason: "",
  department_id: "d1", pos_x: 2, pos_y: 2, temperature: 0.3, model: "fast", resting_since: "2026-01-01T10:00:00Z" } as unknown as Agent;
const room = { id: "r1", name: "Finanzas", slug: "finanzas", grid_x: 0, grid_y: 0, width: 8, height: 8, color: "#fff", doors: [],
  furniture: [], modules: [{ id: "m1", module_key: "filing_cabinet", name: "Archivador", config: {} }] } as unknown as Room;
const snapshot = { id: "c", name: "Acme", mission: "M", values: "", status: "active", daily_budget_eur: 2, monthly_budget_eur: 30,
  departments: [{ id: "d1", name: "Finanzas", color: "#000" }], office: { width: 10, height: 10, rooms: [room] }, agents: [agent] } as unknown as Snapshot;
const task = { id: "t1", title: "Presupuesto", status: "failed", instructions: "", priority: 1, assigned_agent_id: "a1", error: "Fallo",
  rejections: 1, result_file_id: "f1", children: [{ id: "t2", title: "Hija", status: "pending", rejections: 0, priority: 2 }] };
const profile = {
  agent,
  profile: { prompt: { version: 2, system_prompt: "Prompt" }, reports: [] },
  capabilities: { tools: ["read_file"], usable_now: [], supervised_by: [{ kind: "review", supervisor_id: "a1" }] },
  knowledge: [{ base_id: "b1", name: "Base", scope: "agent", can_read: true, can_write: true }],
  work: { current: null, queue: [task], finished: [] },
  performance: { completed: 3, failed: 0, accepted_first_pct: 100, avg_seconds: 2, avg_steps: 3 },
  cost: { by_day: [{ day: "2026-01-01", cost_eur: 0.1 }], by_task: [{ task_id: "t1aaaaaaaa", cost_eur: 0.1, tokens: 9 }], tokens: { input: 1, output: 2 }, today_eur: 0.1, budget_eur: 1 },
  memory: [{ id: "m", summary: "Recuerdo uno" }],
  audit: { traces: [{ id: "tr", step: 0, kind: "task", model: "fake", prompt_version: 1, input_tokens: 1, output_tokens: 1, cost_eur: 0, output: "Salida", tool_calls: [{ name: "x", input: {} }], rag_chunk_ids: ["c"], latency_ms: 3 }], anomalies: [{ id: "an", rule: "bucle", severity: "high", status: "open" }] },
};

function respond(url: string): unknown {
  if (url.includes("/access")) return [{ agent_id: "a1", name: "Gloria", home: false, custom: false, can_enter: true, can_use_tools: true }];
  if (url.includes("/tools/catalog")) return [{ name: "read_file", description: "Lee un fichero", input_schema: {}, sensitive: false, core: false, modules: ["Archivador"] }, { name: "delete_file", description: "Borra", input_schema: {}, sensitive: true, core: false, modules: [] }];
  if (url.includes("default-prompt")) return { system_prompt: "Predeterminado" };
  if (url.includes("/prompt-preview")) return { version: 2, layers: [{ source: "base", text: "Prompt" }, { source: "rules", text: "Reglas fijas" }], system: "Prompt\n\nReglas fijas", tools: [{ name: "read_file", description: "Lee", input_schema: {} }], memory: "- Recuerdo" };
  if (url.includes("/role-catalog")) return { groups: [] };
  if (url.includes("/departments")) return [{ id: "d1", name: "Finanzas", color: "#10b981" }];
  if (url.includes("/routine")) return { rules: {}, defaults: { resting: "break", meeting: "boardroom", reading: "cabinet" }, targets: ["break", "boardroom", "cabinet", "workplace"] };
  if (url.includes("/profile")) return profile;
  if (url.includes("/prompt-versions")) return [{ version: 1, note: "n", system_prompt: "Otro" }];
  if (url.includes("/messages")) return [{ id: "1", role: "agent", content: "Hola", citations: [{ n: 1, document: "doc.md", page: 2 }] }];
  if (url.includes("/finance/dashboard")) return { income_eur: 1, expense_eur: 2, ai_eur: 3, forecast_eur: 4, monthly_limit_eur: 5, ai_by_day: [{ day: "d", cost_eur: 1 }], ai_by_agent: [{ agent_id: "a1", name: "Gloria", cost_eur: 1 }], budget_vs_real: [{ category: "IA", budget_eur: 1, real_eur: 2 }] };
  if (url.includes("/status-bar")) return { company: "Acme", status: "active", spend_today_eur: 1, daily_limit_eur: 2, pending_approvals: 1, open_anomalies: 1 };
  if (url.includes("/company/ai")) return { settings: {}, llm_provider: "fake", defaults: { powerful: "p", fast: "f" }, active_embeddings: "hash:v1", ollama_models: ["llama"], downloaded_models: ["bge"], embedding_providers: ["hash"] };
  if (url.endsWith("/company")) return snapshot;
  if (url.includes("/approvals")) return [{ id: "ap", action_type: "delete_file", status: "pending", payload: { input: { a: 1 } }, task_id: "t1", requester_name: "Gloria", approver_agent_id: null, comment: "" }];
  if (url.includes("/trace")) return [{ id: "s", step: 0, model: "fake", output: "x", tool_calls: [] }];
  if (url.includes("/anomalies")) return [{ id: "an", agent_id: "a1", rule: "bucle", severity: "high", status: "open" }];
  if (url.includes("/audit/events")) return [{ seq: 1, actor: "a1", type: "task.done", target: "t", cost_eur: 0, created_at: "2026-01-01T10:00:00Z" }];
  if (url.includes("/audit/verify")) return { valid: true, checked: 3, broken_at_seq: null };
  if (url.match(/\/goals\/\w+$/)) return { id: "g1", title: "Objetivo", description: "D", status: "plan_review", plan: { summary: "Plan", tasks: [{ role: "cfo", title: "Tarea", instructions: "I" }] }, tasks: [task] };
  if (url.includes("/goals")) return [{ id: "g1", title: "Objetivo", status: "running" }];
  if (url.includes("/org-chart")) return [{ id: "a1", name: "Gloria", role: "cfo", status: "idle", reports: [{ id: "a2", name: "Otro", role: "x", status: "error", reports: [] }] }];
  if (url.includes("/supervisions")) return [{ id: "s1", supervisor_id: "a1", supervised_id: "a1", kind: "review", tools: [] }];
  if (url.endsWith("/documents")) return [{ id: "k", title: "doc.md", status: "indexed", chunks: 2 }];
  if (url.includes("/knowledge-bases")) return [{ id: "b1", name: "Base Finanzas", scope: "room", scope_id: "r1", documents: 1 }];
  if (url.includes("/modules/catalog")) return [{ key: "filing_cabinet", name: "Archivador", description: "D" }, { key: "whiteboard", name: "Pizarra", description: "D" }];
  if (url.match(/\/rooms\/r1$/)) return room;
  if (url.includes("/files")) return [{ id: "f1", name: "a.md", size_bytes: 2048, version: 1, created_by_agent_id: "a1" }];
  if (url.includes("/tasks")) return { pending: [], in_progress: [], in_review: [], blocked: [{ ...task, status: "blocked", blocked_reason: "approval" }], done: [], failed: [task] };
  if (url.includes("/notifications")) return [{ id: "n", title: "Aviso", link: "/goals", read_at: null }];
  if (url.includes("/meetings")) return [{ id: "me", topic: "Tema", status: "done", minutes_file_id: "f1" }];
  if (url.includes("/search")) return { files: [{ id: "f", name: "a.md", snippet: "s" }], tasks: [task], agents: [agent], knowledge: [{ n: 1, document: "d", fragment: "x", page: 1 }] };
  return {};
}

function wrap(children: ReactNode, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(respond(url)), { status: 200 })));
  useOffice.getState().setSnapshot(snapshot);
});
afterEach(() => vi.unstubAllGlobals());

describe("pantallas", () => {
  it("ficha: recorre todas las pestañas", async () => {
    const user = userEvent.setup();
    render(wrap(<AgentProfile agentId="a1" />));
    useOffice.setState({ profileTab: "profile" });
    expect(await screen.findByText("Personalidad y tono")).toBeInTheDocument();
    for (const [tab, text] of [["Prompt", "Reglas fijas"], ["Capacidades", "sin módulo en su sala"], ["Conocimiento", "Base"], ["Trabajo", "Presupuesto"], ["Rendimiento", "Aceptadas a la primera"], ["Coste", "Gasto por día"], ["Auditoría", /bucle/], ["Chat", /doc\.md, pág\. 2/]] as const) {
      await user.click(screen.getByRole("tab", { name: tab }));
      expect(await screen.findByText(text)).toBeInTheDocument();
    }
    await user.click(screen.getByRole("tab", { name: "Memoria" }));
    expect(await screen.findByDisplayValue("Recuerdo uno")).toBeInTheDocument();
  });

  it("objetivo: muestra plan y árbol", async () => {
    render(wrap(<Routes><Route path="/goals/:id" element={<GoalsPage />} /></Routes>, "/goals/g1"));
    expect(await screen.findByRole("button", { name: "Aprobar plan" })).toBeInTheDocument();
    expect(await screen.findByText("Hija")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Aprobar plan" }));
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  });

  it("aprobaciones: decide y ve la traza", async () => {
    render(wrap(<ApprovalsPage />));
    await userEvent.click((await screen.findAllByRole("button", { name: "Ver la traza" }))[0]);
    await userEvent.click(screen.getAllByRole("button", { name: "Aprobar" })[0]);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/decision"), expect.anything()));
  });

  it("auditoría: verifica y resuelve", async () => {
    render(wrap(<AuditPage />));
    await userEvent.click(await screen.findByRole("button", { name: "Verificar integridad" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Cadena íntegra (3 eventos)");
    await userEvent.click(await screen.findByRole("button", { name: "Resolver" }));
  });

  it("organigrama: contratar y supervisión", async () => {
    render(wrap(<OrgChartPage />));
    expect(await screen.findByText("Otro")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Cargo"), "__other");
    await userEvent.type(screen.getByLabelText("Rol"), "seo");
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "pre_approval");
    expect((await screen.findAllByRole("checkbox", { name: /delete_file/ })).length).toBeGreaterThan(1);
  });

  it("conocimiento y ajustes", async () => {
    render(wrap(<KnowledgePage />));
    await userEvent.click(await screen.findByRole("button", { name: /Base Finanzas/ }));
    expect(await screen.findByText("doc.md")).toBeInTheDocument();
    render(wrap(<SettingsPage />));
    expect(await screen.findByText(/Modo simulado/)).toBeInTheDocument();
  });

  it("sala: pestañas y gestor de módulos", async () => {
    render(wrap(<RoomPanel roomId="r1" />));
    await userEvent.click(await screen.findByRole("tab", { name: "⚙ Módulos" }));
    expect(await screen.findByRole("button", { name: "Instalar" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Instalar" }));
  });

  it("todos los paneles de módulo se pintan", async () => {
    for (const [key, Panel] of Object.entries(MODULE_PANELS)) {
      const module = { id: "m", module_key: key, name: key, config: { currency: "EUR", notes: [] } } as RoomModule;
      const { unmount } = render(wrap(<Panel room={room} module={module} />));
      await waitFor(() => expect(document.body.textContent).not.toBe(""));
      await new Promise((resolve) => setTimeout(resolve, 20));
      unmount();
    }
  });

  it("accesos, búsqueda, avisos y plano", async () => {
    render(wrap(<LoginPage setup />));
    expect(screen.getByText("Crea tu cuenta de dueño")).toBeInTheDocument();
    render(wrap(<OnboardingPage />));
    expect(screen.getByText("Monta tu empresa")).toBeInTheDocument();
    render(wrap(<FlatMap />));
    expect(screen.getByRole("img", { name: "Plano de la oficina" })).toBeInTheDocument();
    render(wrap(<NotificationsButton />));
    await userEvent.click(await screen.findByRole("button", { name: /Avisos: 1/ }));
    render(wrap(<SearchDialog onClose={() => {}} />));
    await userEvent.type(screen.getByLabelText("Buscar"), "a{Enter}");
    expect(await screen.findByText(/Agente: Gloria/)).toBeInTheDocument();
  });
});
