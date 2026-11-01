import type { Agent, Snapshot } from "@/api/types";
import { useOffice } from "@/store/office";

const agent = { id: "a", name: "Ada", status: "idle", pos_x: 1, pos_y: 1 } as Agent;
const snapshot = { status: "active", agents: [agent], departments: [], office: { rooms: [] } } as unknown as Snapshot;

describe("office store", () => {
  beforeEach(() => useOffice.getState().setSnapshot(snapshot));

  it("aplica cambios de estado", () => {
    useOffice.getState().applyEvent("agent.status", { agent_id: "a", status: "thinking" }, 0);
    expect(useOffice.getState().agents.a.status).toBe("thinking");
  });

  it("guarda la ruta y la casilla final", () => {
    const path = [[1, 1], [2, 1], [2, 2]];
    useOffice.getState().applyEvent("agent.moved", { agent_id: "a", path, seconds_per_tile: 0.2, room_id: "r" }, 10);
    const state = useOffice.getState();
    expect(state.walks.a.path).toEqual(path);
    expect(state.agents.a).toMatchObject({ pos_x: 2, pos_y: 2, current_room_id: "r" });
  });

  it("acumula el streaming y lo limpia al terminar", () => {
    const { applyEvent } = useOffice.getState();
    applyEvent("agent.message", { agent_id: "a", delta: "Ho" }, 0);
    useOffice.getState().applyEvent("agent.message", { agent_id: "a", delta: "la" }, 0);
    expect(useOffice.getState().streams.a).toBe("Hola");
    useOffice.getState().applyEvent("agent.message_done", { agent_id: "a" }, 0);
    expect(useOffice.getState().streams.a).toBeUndefined();
  });

  it("marca anomalías y pausa general", () => {
    useOffice.getState().applyEvent("audit.anomaly", { agent_id: "a" }, 0);
    useOffice.getState().applyEvent("company.paused", { paused: true }, 0);
    expect(useOffice.getState().flagged.a).toBe(true);
    expect(useOffice.getState().paused).toBe(true);
  });

  it("quita agentes despedidos e ignora desconocidos", () => {
    useOffice.getState().applyEvent("agent.status", { agent_id: "x", status: "error" }, 0);
    useOffice.getState().applyEvent("agent.archived", { agent_id: "a" }, 0);
    expect(useOffice.getState().agents).toEqual({});
  });
});
