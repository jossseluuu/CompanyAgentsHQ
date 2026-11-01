import type { ComponentType } from "react";

import type { Room, RoomModule } from "@/api/types";

import { AuditPanel } from "./audit_panel/Panel";
import { BreakArea } from "./break_area/Panel";
import { CostMonitor } from "./cost_monitor/Panel";
import { FilingCabinet } from "./filing_cabinet/Panel";
import { FinanceDashboard } from "./finance_dashboard/Panel";
import { KnowledgeBasePanel } from "./knowledge_base/Panel";
import { MeetingTable } from "./meeting_table/Panel";
import { OwnerInbox } from "./owner_inbox/Panel";
import { TaskBoard } from "./task_board/Panel";
import { Team } from "./team/Panel";
import { Whiteboard } from "./whiteboard/Panel";

export interface ModuleProps {
  room: Room;
  module: RoomModule;
}

/** Clave del plugin en el backend → panel que lo pinta. */
export const MODULE_PANELS: Record<string, ComponentType<ModuleProps>> = {
  filing_cabinet: FilingCabinet,
  task_board: TaskBoard,
  team: Team,
  knowledge_base: KnowledgeBasePanel,
  finance_dashboard: FinanceDashboard,
  break_area: BreakArea,
  meeting_table: MeetingTable,
  audit_panel: AuditPanel,
  cost_monitor: CostMonitor,
  owner_inbox: OwnerInbox,
  whiteboard: Whiteboard,
};
