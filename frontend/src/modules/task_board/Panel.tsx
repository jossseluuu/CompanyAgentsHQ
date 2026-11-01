import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api } from "@/api/client";
import type { Task } from "@/api/types";
import type { ModuleProps } from "@/modules/registry";
import { Badge, Button, ErrorNote, Field, inputClass, statusLabel } from "@/shared/ui";
import { useOffice } from "@/store/office";

const COLUMNS = ["pending", "in_progress", "in_review", "blocked", "done", "failed"];

export function TaskBoard({ room }: ModuleProps) {
  const client = useQueryClient();
  const agents = useOffice((s) => s.agents);
  const { data } = useQuery({ queryKey: ["board", room.id], queryFn: () => api.get<Record<string, Task[]>>(`/rooms/${room.id}/tasks`) });
  const [form, setForm] = useState({ title: "", instructions: "", agent_id: "", priority: 2 });
  const [error, setError] = useState<unknown>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.post("/tasks", { ...form, room_id: room.id });
      setForm({ ...form, title: "", instructions: "" });
      await client.invalidateQueries({ queryKey: ["board", room.id] });
    } catch (failure) {
      setError(failure);
    }
  };
  const act = async (id: string, verb: string) => {
    setError(null);
    try {
      await api.post(`/tasks/${id}/${verb}`);
      await client.invalidateQueries({ queryKey: ["board", room.id] });
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <div className="space-y-3 text-sm">
      <form onSubmit={submit} className="space-y-1 rounded bg-ink-soft p-2">
        <Field label="Nueva tarea"><input required className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Instrucciones"><textarea className={inputClass} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></Field>
        <div className="flex gap-2">
          <select required aria-label="Agente" className={inputClass} value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })}>
            <option value="">Asignar a…</option>
            {Object.values(agents).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select aria-label="Prioridad" className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}>
            <option value={1}>Alta</option>
            <option value={2}>Media</option>
            <option value={3}>Baja</option>
          </select>
          <Button type="submit" tone="primary">Crear</Button>
        </div>
      </form>
      <ErrorNote error={error} />
      {COLUMNS.map((column) =>
        data?.[column]?.length ? (
          <section key={column}>
            <h3 className="font-semibold">{statusLabel(column)} ({data[column].length})</h3>
            {data[column].map((task) => (
              <article key={task.id} className="mt-1 rounded bg-ink-soft p-2">
                <p>{task.title}</p>
                <p className="flex items-center gap-1 text-xs text-slate-300">
                  {agents[task.assigned_agent_id ?? ""]?.name ?? "Sin asignar"}
                  {task.priority === 1 && <Badge>Alta</Badge>}
                  {task.blocked_reason && column === "blocked" && <Badge>{task.blocked_reason}</Badge>}
                  {column === "failed" && <Button onClick={() => act(task.id, "retry")}>Reintentar</Button>}
                  {["pending", "in_progress", "blocked"].includes(column) && <Button onClick={() => act(task.id, "cancel")}>Cancelar</Button>}
                </p>
              </article>
            ))}
          </section>
        ) : null,
      )}
    </div>
  );
}
