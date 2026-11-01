import { create } from "zustand";

import type { Agent, AgentStatus, Snapshot } from "@/api/types";
import { type Tile, type Walk } from "@/office/pathAnimator";

interface Bubble {
  text: string;
  until: number;
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
