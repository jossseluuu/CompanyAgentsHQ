import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/client";
import { AgentProfile } from "@/features/agent-profile/AgentProfile";
import { STATUS } from "@/office/status";
import { Button, Empty, inputClass } from "@/shared/ui";
import { useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

import { HireDialog } from "./HireForm";

/** Toda la plantilla de un vistazo; la ficha de al lado enseña y edita todo lo de cada agente. */
export function TeamPage() {
  const agents = Object.values(useOffice((s) => s.agents));
  const snapshot = useOffice((s) => s.snapshot);
  const selected = useOffice((s) => s.profileAgentId);
  const { openAgent } = useOffice.getState();
  const [text, setText] = useState("");
  const [department, setDepartment] = useState("");
  const [hiring, setHiring] = useState(false);
  const roomName = (id: string | null) => snapshot?.office.rooms.find((r) => r.id === id)?.name ?? "—";
  const departmentName = (id: string | null) => snapshot?.departments.find((d) => d.id === id)?.name ?? "—";
  const { data: catalog } = useQuery({
    queryKey: ["role-catalog"],
    queryFn: () => api.get<{ groups: { name: string; roles: { key: string; code: string; title: string }[] }[] }>("/role-catalog"),
  });
  const roleOf = (key: string) => catalog?.groups.flatMap((g) => g.roles).find((r) => r.key === key);
  const needle = text.trim().toLowerCase();
  const shown = agents.filter(
    (a) => (!department || a.department_id === department) && (!needle || `${a.name} ${a.role} ${roleOf(a.role)?.title ?? ""} ${roleOf(a.role)?.code ?? ""} ${a.model}`.toLowerCase().includes(needle)),
  );
  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="page-title">{t("Equipo")}</h1>
          <Button tone="primary" onClick={() => setHiring(true)}>{t("＋ Contratar")}</Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input aria-label={t("Buscar en el equipo")} placeholder={t("Nombre, rol o modelo")} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
          <select aria-label={t("Filtrar por departamento")} className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">{t("Todos los departamentos")}</option>
            {snapshot?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {shown.length === 0 ? (
          <Empty>{t("Nadie coincide con la búsqueda")}</Empty>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-300">
              <tr>
                <th className="py-1">{t("Nombre")}</th>
                <th>{t("Cargo")}</th>
                <th>{t("Estado")}</th>
                <th>{t("Sala")}</th>
                <th>{t("Departamento")}</th>
                <th>{t("Modelo")}</th>
                <th>{t("Herramientas")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((agent) => (
                <tr key={agent.id} className={`border-t border-ink-line ${agent.id === selected ? "bg-ink-soft" : ""}`}>
                  <td className="py-1">
                    <button className="font-semibold underline-offset-2 hover:underline" onClick={() => openAgent(agent.id, "prompt")}>{agent.name}</button>
                  </td>
                  <td title={roleOf(agent.role)?.title}>{roleOf(agent.role)?.code ?? agent.role}</td>
                  <td><span aria-hidden>{STATUS[agent.status].icon}</span> {STATUS[agent.status].label}</td>
                  <td>{roomName(agent.home_room_id)}</td>
                  <td>{departmentName(agent.department_id)}</td>
                  <td>{agent.model}</td>
                  <td className="tabular-nums">{agent.tools.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selected && <AgentProfile agentId={selected} />}
      {hiring && <HireDialog onClose={() => setHiring(false)} />}
    </div>
  );
}
