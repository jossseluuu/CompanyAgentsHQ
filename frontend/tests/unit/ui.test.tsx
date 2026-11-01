import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { ApiError, api, setCsrf } from "@/api/client";
import type { Room, RoomModule } from "@/api/types";
import { promptDiff } from "@/features/agent-profile/AgentProfile";
import { MODULE_PANELS } from "@/modules/registry";
import { STATUS } from "@/office/status";
import { BarChart, statusLabel, Tabs } from "@/shared/ui";

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("api client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("envía el token CSRF en las mutaciones", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setCsrf("tok");
    await api.post("/x", { a: 1 });
    expect(fetchMock.mock.calls[0][1].headers["X-CSRF-Token"]).toBe("tok");
  });

  it("convierte el error normalizado en ApiError", async () => {
    const body = JSON.stringify({ error: { code: "not_found", message: "No" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 404 })));
    await expect(api.get("/x")).rejects.toEqual(new ApiError("not_found", "No", 404));
  });
});

describe("componentes", () => {
  it("todo estado tiene icono y texto", () => {
    Object.values(STATUS).forEach((s) => expect(s.icon && s.label).toBeTruthy());
  });

  it("todos los módulos del backend tienen panel", () => {
    const backend = ["filing_cabinet", "task_board", "team", "knowledge_base", "finance_dashboard", "break_area",
      "meeting_table", "audit_panel", "cost_monitor", "owner_inbox", "whiteboard"];
    backend.forEach((key) => expect(MODULE_PANELS[key]).toBeDefined());
  });

  it("marca la pestaña activa", () => {
    render(<Tabs tabs={[{ key: "a", label: "A" }, { key: "b", label: "B" }]} active="b" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "B" })).toHaveAttribute("aria-selected", "true");
  });

  it("la gráfica ofrece tabla", () => {
    render(<BarChart title="Gasto" rows={[{ label: "lun", value: 1 }]} />);
    expect(screen.getByText("Ver tabla")).toBeInTheDocument();
  });

  it("gráfica sin datos", () => {
    render(<BarChart title="Gasto" rows={[]} />);
    expect(screen.getByText(/sin datos/)).toBeInTheDocument();
  });

  it("traduce estados", () => expect(statusLabel("in_review")).toBe("En revisión"));

  it("compara versiones de prompt", () => {
    expect(promptDiff("a\nb", "a\nc")).toEqual([{ sign: "−", text: "b" }, { sign: "+", text: "c" }]);
  });

  it("pizarra pinta notas", () => {
    const Panel = MODULE_PANELS.whiteboard;
    const module = { id: "m", module_key: "whiteboard", name: "Pizarra", config: { notes: [{ author: "Ada", text: "Hola" }] } } as RoomModule;
    render(wrap(<Panel room={{ id: "r" } as Room} module={module} />));
    expect(screen.getByText("Hola")).toBeInTheDocument();
  });
});
