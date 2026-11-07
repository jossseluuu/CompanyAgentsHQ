import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import { api } from "@/api/client";
import type { KnowledgeBase } from "@/api/types";
import { AgentProfile } from "@/features/agent-profile/AgentProfile";
import { RoomPanel } from "@/features/room/RoomPanel";
import { Button, ErrorNote, inputClass } from "@/shared/ui";
import { useOffice } from "@/store/office";

import { FlatMap, hasWebGL } from "./FlatMap";
import { OfficeEditor } from "./OfficeEditor";
import { OfficeScene, type ScreenToGrid } from "./OfficeScene";
import { PlanEditor } from "./PlanEditor";
import { STATUS } from "./status";
import { t } from "@/shared/i18n";

export function OfficeView() {
  const snapshot = useOffice((s) => s.snapshot);
  const agents = useOffice((s) => s.agents);
  const roomId = useOffice((s) => s.selectedRoomId);
  const agentId = useOffice((s) => s.profileAgentId);
  const { openRoom, openAgent, setHighlight, setProblemsOnly } = useOffice.getState();
  const highlight = useOffice((s) => s.highlightDepartment);
  const problems = useOffice((s) => s.problemsOnly);
  const editing = useOffice((s) => s.editing);
  const editView = useOffice((s) => s.editView);
  const picker = useRef<ScreenToGrid | null>(null);
  const [dropError, setDropError] = useState<unknown>(null);
  const queryClient = useQueryClient();
  const webgl = useMemo(hasWebGL, []);

  if (!snapshot) return null;

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropError(null);
    const point = picker.current?.(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    const room = point
      ? snapshot.office.rooms.find(
          (r) =>
            point[0] >= r.grid_x && point[0] < r.grid_x + r.width && point[1] >= r.grid_y && point[1] < r.grid_y + r.height,
        )
      : undefined;
    if (!room) return;
    try {
      for (const file of Array.from(event.dataTransfer.files)) {
        if (event.shiftKey) {
          const bases = await api.get<KnowledgeBase[]>("/knowledge-bases");
          const base = bases.find((b) => b.scope === "room" && b.scope_id === room.id);
          if (base) await api.upload(`/knowledge-bases/${base.id}/upload`, file, { room_id: room.id });
        } else {
          await api.upload(`/rooms/${room.id}/files`, file);
        }
      }
      openRoom(room.id, "filing_cabinet");
      await queryClient.invalidateQueries({ queryKey: ["files", room.id] });
    } catch (error) {
      setDropError(error);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <nav aria-label={t("Salas y agentes")} hidden={editing} className={`w-56 shrink-0 space-y-3 overflow-y-auto border-r border-ink-line p-2 text-sm ${editing ? "hidden" : ""}`}>
        <section>
          <h2 className="mb-1 font-semibold text-slate-200">{t("Salas")}</h2>
          <ul>
            {snapshot.office.rooms.map((room) => (
              <li key={room.id}>
                <button className="w-full rounded px-1 text-left hover:bg-ink-soft" onClick={() => openRoom(room.id)}>
                  {room.name}
                </button>
              </li>
            ))}
          </ul>
          <Button className="mt-1 w-full" aria-pressed={editing} onClick={() => useOffice.getState().setEditing(!editing)}>
            {t("✎ Editar oficina")}
          </Button>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-slate-200">{t("Agentes")}</h2>
          <ul>
            {Object.values(agents).map((agent) => (
              <li key={agent.id}>
                <button className="flex w-full justify-between gap-1 rounded px-1 text-left hover:bg-ink-soft" onClick={() => openAgent(agent.id)}>
                  <span>{agent.name}</span>
                  <span className="truncate text-xs text-slate-300">
                    <span aria-hidden>{STATUS[agent.status].icon}</span> {STATUS[agent.status].label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="space-y-1">
          <h2 className="font-semibold text-slate-200">{t("Vista")}</h2>
          <select
            aria-label={t("Resaltar departamento")}
            className={inputClass}
            value={highlight ?? ""}
            onChange={(e) => setHighlight(e.target.value || null)}
          >
            <option value="">{t("Todos los departamentos")}</option>
            {snapshot.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-slate-300">
            <input type="checkbox" checked={problems} onChange={(e) => setProblemsOnly(e.target.checked)} />
            {t("Solo con problemas")}
          </label>
        </section>
      </nav>
      <div
        className="relative min-w-0 flex-1 overflow-hidden"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        {editing && (editView === "plan" || !webgl) ? <PlanEditor /> : webgl ? <OfficeScene picker={picker} /> : <FlatMap className="h-full w-full" />}
        {webgl && !editing && (
          <div className="absolute right-2 top-2 w-44 rounded border border-ink-line bg-slate-900/80 p-1">
            <FlatMap />
          </div>
        )}
        {dropError ? (
          <div className="absolute left-3 top-3">
            <ErrorNote error={dropError} />
          </div>
        ) : null}
      </div>
      {editing && <OfficeEditor />}
      {!editing && roomId && <RoomPanel roomId={roomId} />}
      {!editing && agentId && <AgentProfile agentId={agentId} />}
    </div>
  );
}
