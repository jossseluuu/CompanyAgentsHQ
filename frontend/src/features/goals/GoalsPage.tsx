import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api, fileUrl } from "@/api/client";
import type { Goal, Task } from "@/api/types";
import { Badge, Button, Empty, ErrorNote, Field, inputClass, statusLabel } from "@/shared/ui";
import { t } from "@/shared/i18n";

function TaskNode({ task }: { task: Task }) {
  const client = useQueryClient();
  const act = async (verb: string) => {
    await api.post(`/tasks/${task.id}/${verb}`);
    await client.invalidateQueries({ queryKey: ["goal"] });
  };
  return (
    <li className="ml-3 border-l border-ink-line pl-2">
      <p className="flex flex-wrap items-center gap-2 py-0.5">
        {task.title} <Badge>{statusLabel(task.status)}</Badge>
        {task.rejections > 0 && <Badge>{task.rejections} {t("devoluciones")}</Badge>}
        {task.result_file_id && <a className="underline" href={fileUrl(task.result_file_id, true)} target="_blank" rel="noreferrer">{t("Resultado")}</a>}
        {task.status === "failed" && <Button onClick={() => act("retry")}>{t("Reintentar")}</Button>}
        {["pending", "in_progress", "blocked"].includes(task.status) && <Button onClick={() => act("cancel")}>{t("Cancelar")}</Button>}
      </p>
      {task.error && <p className="text-xs text-red-200">{task.error}</p>}
      {task.children && task.children.length > 0 && <ul>{task.children.map((c) => <TaskNode key={c.id} task={c} />)}</ul>}
    </li>
  );
}

function GoalDetail({ id }: { id: string }) {
  const client = useQueryClient();
  const { data: goal } = useQuery({ queryKey: ["goal", id], queryFn: () => api.get<Goal>(`/goals/${id}`) });
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  if (!goal) return null;
  const decide = async (verb: "approve-plan" | "reject-plan") => {
    try {
      const body = verb === "approve-plan" && editing !== null ? { plan: JSON.parse(editing) } : {};
      await api.post(`/goals/${id}/${verb}`, body);
      await client.invalidateQueries({ queryKey: ["goal"] });
      await client.invalidateQueries({ queryKey: ["goals"] });
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <section className="space-y-3 text-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold">{goal.title} <Badge>{statusLabel(goal.status)}</Badge></h2>
      <p className="text-slate-300">{goal.description}</p>
      {goal.status === "planning" && <p>{t("La CEO está preparando el plan…")}</p>}
      {goal.plan && (
        <div className="rounded border border-ink-line bg-ink-soft p-3">
          <h3 className="font-semibold">{t("Plan de la CEO")}</h3>
          <p className="mb-2">{goal.plan.summary}</p>
          {editing === null ? (
            <ul className="list-disc pl-4">
              {goal.plan.tasks.map((task) => <li key={task.title}><strong>{task.role}:</strong> {task.title}. <span className="text-slate-300">{task.instructions}</span></li>)}
            </ul>
          ) : (
            <textarea aria-label={t("Plan en JSON")} className={`${inputClass} h-48 font-mono`} value={editing} onChange={(e) => setEditing(e.target.value)} />
          )}
          <ErrorNote error={error} />
          {goal.status === "plan_review" && (
            <div className="mt-2 flex gap-2">
              <Button tone="primary" onClick={() => decide("approve-plan")}>{t("Aprobar plan")}</Button>
              <Button onClick={() => setEditing(editing === null ? JSON.stringify(goal.plan, null, 2) : null)}>{editing === null ? t("Editar") : t("Ver")}</Button>
              <Button tone="danger" onClick={() => decide("reject-plan")}>{t("Rechazar")}</Button>
            </div>
          )}
        </div>
      )}
      {goal.tasks && goal.tasks.length > 0 && (
        <div>
          <h3 className="font-semibold">{t("Árbol de tareas")}</h3>
          <ul>{goal.tasks.map((task) => <TaskNode key={task.id} task={task} />)}</ul>
        </div>
      )}
    </section>
  );
}

export function GoalsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: goals = [] } = useQuery({ queryKey: ["goals"], queryFn: () => api.get<Goal[]>("/goals") });
  const [form, setForm] = useState({ title: "", description: "" });
  const [error, setError] = useState<unknown>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const goal = await api.post<Goal>("/goals", form);
      setForm({ title: "", description: "" });
      await client.invalidateQueries({ queryKey: ["goals"] });
      navigate(`/goals/${goal.id}`);
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-80 shrink-0 space-y-3 overflow-y-auto border-r border-ink-line p-3">
        <form onSubmit={submit} className="space-y-2">
          <h1 className="text-lg font-semibold">{t("Nuevo objetivo para la CEO")}</h1>
          <Field label={t("Título")}>
            <input required className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label={t("Descripción")}>
            <textarea className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <ErrorNote error={error} />
          <Button type="submit" tone="primary">{t("Dar objetivo")}</Button>
        </form>
        <ul className="space-y-1 text-sm">
          {goals.map((goal) => (
            <li key={goal.id}>
              <button className="flex w-full justify-between gap-2 rounded p-1 text-left hover:bg-ink-soft" onClick={() => navigate(`/goals/${goal.id}`)}>
                <span>{goal.title}</span>
                <Badge>{statusLabel(goal.status)}</Badge>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">{id ? <GoalDetail id={id} /> : <Empty>{t("Da un objetivo o elige uno de la lista")}</Empty>}</div>
    </div>
  );
}
