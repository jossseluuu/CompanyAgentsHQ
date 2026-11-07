import { create } from "zustand";

import { api } from "@/api/client";
import type { Agent, AgentStatus, Snapshot } from "@/api/types";
import { type Tile, type Walk } from "@/office/pathAnimator";
import { roomAt, type Box } from "@/office/planRules";

interface Bubble {
  text: string;
  until: number;
}

export type EditTool = "select" | "door" | "room";

/** Mueble elegido en el catálogo, a la espera de un clic en el suelo. */
export interface Brush {
  model_key: string;
  width: number;
  depth: number;
  variant: string;
  rotation: number;
}

interface OfficeState {
  snapshot: Snapshot | null;
  agents: Record<string, Agent>;
  walks: Record<string, Walk>;
  bubbles: Record<string, Bubble>;
  flagged: Record<string, boolean>;
  streams: Record<string, string>;
  connected: boolean;
  paused: boolean;
  selectedRoomId: string | null;
  selectedTab: string | null;
  profileAgentId: string | null;
  profileTab: string;
  followAgentId: string | null;
  highlightDepartment: string | null;
  problemsOnly: boolean;
  editing: boolean;
  editRoomId: string | null;
  editFurnitureId: string | null;
  editError: unknown;
  editTool: EditTool;
  editBrush: Brush | null;
  editDraft: Box | null;
  editView: "plan" | "scene";
  setEditTool: (tool: EditTool) => void;
  setEditBrush: (brush: Brush | null) => void;
  setEditDraft: (draft: Box | null) => void;
  setEditView: (view: "plan" | "scene") => void;
  setEditError: (error: unknown) => void;
  setEditing: (editing: boolean) => void;
  editSelect: (roomId: string | null) => void;
  editPick: (furnitureId: string | null) => void;
  placeFurniture: (x: number, y: number) => Promise<void>;
  setSnapshot: (snapshot: Snapshot) => void;
  setConnected: (connected: boolean) => void;
  applyEvent: (type: string, data: any, ts: number) => void;
  openRoom: (roomId: string | null, tab?: string | null) => void;
  openAgent: (agentId: string | null, tab?: string) => void;
  follow: (agentId: string | null) => void;
  setHighlight: (departmentId: string | null) => void;
  setProblemsOnly: (value: boolean) => void;
  replay: (agentId: string, path: Tile[]) => void;
}

const BUBBLE_MS = 4000;

export const useOffice = create<OfficeState>((set, get) => ({
  snapshot: null,
  agents: {},
  walks: {},
  bubbles: {},
  flagged: {},
  streams: {},
  connected: false,
  paused: false,
  selectedRoomId: null,
  selectedTab: null,
  profileAgentId: null,
  profileTab: "profile",
  followAgentId: null,
  highlightDepartment: null,
  problemsOnly: false,
  editing: false,
  editRoomId: null,
  editFurnitureId: null,
  editError: null,
  editTool: "select",
  editBrush: null,
  editDraft: null,
  editView: "plan",
  setEditTool: (editTool) => set({ editTool, editBrush: null, editDraft: null, editError: null }),
  setEditBrush: (editBrush) => set({ editBrush, editTool: "select", editFurnitureId: null, editError: null }),
  setEditDraft: (editDraft) => set({ editDraft }),
  setEditView: (editView) => set({ editView }),
  setEditError: (editError) => set({ editError }),
  setEditing: (editing) =>
    set({
      editing, editRoomId: null, editFurnitureId: null, editError: null, editBrush: null, editDraft: null,
      editTool: "select", editView: "plan", selectedRoomId: null, profileAgentId: null,
    }),
  editSelect: (roomId) => set({ editRoomId: roomId, editFurnitureId: null, editError: null }),
  editPick: (furnitureId) => set({ editFurnitureId: furnitureId, editError: null }),
  placeFurniture: async (x, y) => {
    const { editFurnitureId, editBrush, snapshot } = get();
    const rooms = snapshot?.office.rooms ?? [];
    const item = rooms.flatMap((r) => r.furniture).find((f) => f.id === editFurnitureId);
    const room = roomAt(rooms, [x, y]);
    try {
      if (editBrush && room) await api.post(`/rooms/${room.id}/furniture`, { ...editBrush, grid_x: x, grid_y: y });
      else if (item) await api.patch(`/furniture/${item.id}`, { grid_x: x, grid_y: y, rotation: item.rotation });
      else return;
      set({ editError: null });
    } catch (failure) {
      set({ editError: failure });
    }
  },
  setSnapshot: (snapshot) =>
    set({
      snapshot,
      agents: Object.fromEntries(snapshot.agents.map((a) => [a.id, a])),
      paused: snapshot.status === "paused",
    }),
  setConnected: (connected) => set({ connected }),
  openRoom: (selectedRoomId, tab = null) => set({ selectedRoomId, selectedTab: tab, profileAgentId: null }),
  openAgent: (profileAgentId, tab = "profile") => set({ profileAgentId, profileTab: tab, selectedRoomId: null }),
  follow: (followAgentId) => set({ followAgentId }),
  setHighlight: (highlightDepartment) => set({ highlightDepartment }),
  setProblemsOnly: (problemsOnly) => set({ problemsOnly }),
  replay: (agentId, path) =>
    set((state) => ({
      walks: { ...state.walks, [agentId]: { path, startedAt: performance.now(), secondsPerTile: 0.2 } },
    })),
  applyEvent: (type, data, ts) => {
    const state = get();
    const agent = data?.agent_id ? state.agents[data.agent_id] : undefined;
    switch (type) {
      case "agent.status":
        if (agent) {
          set({ agents: { ...state.agents, [agent.id]: { ...agent, status: data.status as AgentStatus } } });
        }
        break;
      case "agent.moved":
      case "agent.strolled":
        if (agent) {
          const path = data.path as Tile[];
          const final = path[path.length - 1];
          set({
            walks: {
              ...state.walks,
              [agent.id]: { path, startedAt: ts, secondsPerTile: data.seconds_per_tile },
            },
            agents: {
              ...state.agents,
              [agent.id]: { ...agent, pos_x: final[0], pos_y: final[1], current_room_id: data.room_id },
            },
          });
        }
        break;
      case "agent.created":
      case "agent.updated":
        set({ agents: { ...state.agents, [data.id]: { ...state.agents[data.id], ...data } } });
        break;
      case "agent.archived": {
        const { [data.agent_id]: _gone, ...rest } = state.agents;
        set({ agents: rest });
        break;
      }
      case "agent.bubble":
      case "agent.chatter":
        set({ bubbles: { ...state.bubbles, [data.agent_id]: { text: data.text, until: ts + BUBBLE_MS } } });
        setTimeout(() => {
          const { [data.agent_id]: _expired, ...bubbles } = get().bubbles;
          set({ bubbles });
        }, BUBBLE_MS);
        break;
      case "agent.message":
        set({
          streams: { ...state.streams, [data.agent_id]: (state.streams[data.agent_id] ?? "") + data.delta },
        });
        break;
      case "agent.message_done": {
        const { [data.agent_id]: _done, ...streams } = state.streams;
        set({ streams });
        break;
      }
      case "audit.anomaly":
        if (data.agent_id) set({ flagged: { ...state.flagged, [data.agent_id]: true } });
        break;
      case "company.paused":
        set({ paused: data.paused });
        break;
    }
  },
}));
