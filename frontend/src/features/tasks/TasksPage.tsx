import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/client";
import type { Task } from "@/api/types";
import { t } from "@/shared/i18n";
import { Badge, Button, Empty, ErrorNote, inputClass, statusLabel } from "@/shared/ui";
import { useOffice } from "@/store/office";

const OPEN = new Set(["pending", "in_progress", "blocked", "in_review"]);
const STATUSES = ["pending", "in_progress", "in_review", "blocked", "done", "failed", "cancelled"];

/** Vista global: reasignar, priorizar y cancelar sin entrar sala por sala. */
export function TasksPage() {
  const client = useQueryClient();
  const agents = useOffice((s) => s.agents);
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => api.get<Task[]>("/tasks") });
  const [status, setStatus] = useState("");
  const [agent, setAgent] = useState("");
  const [error, setError] = useState<unknown>(null);
  const shown = tasks.filter((task) => (!status || task.status === status) && (!agent || task.assigned_agent_id === agent));

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["tasks"] });
    } catch (failure) {
      setError(failure);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">{t("Tareas")}</h1>
      <div className="flex flex-wrap gap-2">
        <select aria-label={t("Filtrar por estado")} className={`${inputClass} w-48`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("Todos los estados")}</option>
          {STATUSES.map((key) => <option key={key} value={key}>{statusLabel(key)}</option>)}
        </select>
        <select aria-label={t("Filtrar por agente")} className={`${inputClass} w-48`} value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">{t("Todos los agentes")}</option>
          {Object.values(agents).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <ErrorNote error={error} />
      {shown.length === 0 && <Empty>{t("Sin tareas")}</Empty>}
      <ul className="space-y-2">
        {shown.map((task) => (
          <li key={task.id} className="flex flex-wrap items-center gap-2 rounded bg-ink-soft p-3 text-sm">
            <div className="min-w-48 flex-1">
              <p className="font-medium">{task.title}</p>
              <Badge>{statusLabel(task.status)}</Badge>
            </div>
            <select
              aria-label={t("Asignar a…")}
              className={`${inputClass} w-40`}
              disabled={!OPEN.has(task.status)}
              value={task.assigned_agent_id ?? ""}
              onChange={(e) => run(() => api.patch(`/tasks/${task.id}`, { assigned_agent_id: e.target.value }))}
            >
              {Object.values(agents).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select
              aria-label={t("Prioridad")}
              className={`${inputClass} w-28`}
              disabled={!OPEN.has(task.status)}
              value={task.priority}
              onChange={(e) => run(() => api.patch(`/tasks/${task.id}`, { priority: Number(e.target.value) }))}
            >
              <option value={1}>{t("Alta")}</option>
              <option value={2}>{t("Media")}</option>
              <option value={3}>{t("Baja")}</option>
            </select>
            {OPEN.has(task.status) && <Button onClick={() => run(() => api.post(`/tasks/${task.id}/cancel`))}>{t("Cancelar")}</Button>}
            {["failed", "cancelled"].includes(task.status) && <Button onClick={() => run(() => api.post(`/tasks/${task.id}/retry`))}>{t("Reintentar")}</Button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
