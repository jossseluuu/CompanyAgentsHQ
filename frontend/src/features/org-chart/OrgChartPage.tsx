import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api } from "@/api/client";
import type { AgentStatus } from "@/api/types";
import { HireForm } from "@/features/team/HireForm";
import { ToolPicker } from "@/features/team/ToolPicker";
import { STATUS } from "@/office/status";
import { Button, ErrorNote, Field, inputClass } from "@/shared/ui";
import { useOffice } from "@/store/office";
import { t } from "@/shared/i18n";

interface Node {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  reports: Node[];
}

interface Supervision {
  id: string;
  supervisor_id: string;
  supervised_id: string;
  kind: string;
  tools: string[];
}

const KINDS: Record<string, string> = { review: t("Revisión de resultados"), pre_approval: t("Aprobación previa"), observer: t("Observador") };

function Branch({ node }: { node: Node }) {
  return (
    <li className="ml-4 border-l border-ink-line pl-3">
      <button className="my-1 rounded bg-ink-soft px-2 py-1 text-left text-sm hover:bg-ink-line" onClick={() => useOffice.getState().openAgent(node.id)}>
        <strong>{node.name}</strong> · {node.role} · <span aria-hidden>{STATUS[node.status].icon}</span> {STATUS[node.status].label}
      </button>
      {node.reports.length > 0 && <ul>{node.reports.map((n) => <Branch key={n.id} node={n} />)}</ul>}
    </li>
  );
}

function Departments() {
  const client = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["departments"], queryFn: () => api.get<{ id: string; name: string; color: string }[]>("/company/departments") });
  const [form, setForm] = useState({ name: "", color: "#6366f1" });
  const [error, setError] = useState<unknown>(null);
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["departments"] });
      await client.invalidateQueries({ queryKey: ["snapshot"] });
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <section className="space-y-2 rounded bg-ink-soft p-3">
      <h2 className="font-semibold">{t("Departamentos")}</h2>
      <ErrorNote error={error} />
      <ul className="space-y-1 text-sm">
        {data.map((department) => (
          <li key={department.id} className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t("Color de {0}", department.name)}
              className="h-6 w-6 rounded"
              defaultValue={department.color}
              onBlur={(e) => run(() => api.patch(`/company/departments/${department.id}`, { name: department.name, color: e.target.value }))}
            />
            <input
              aria-label={t("Nombre de {0}", department.name)}
              className={inputClass}
              defaultValue={department.name}
              onBlur={(e) => e.target.value !== department.name && run(() => api.patch(`/company/departments/${department.id}`, { name: e.target.value, color: department.color }))}
            />
            <Button aria-label={t("Borrar {0}", department.name)} onClick={() => run(() => api.del(`/company/departments/${department.id}`))}>✕</Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await api.post("/company/departments", form);
            setForm({ ...form, name: "" });
          });
        }}
      >
        <input required aria-label={t("Nuevo departamento")} placeholder={t("Nuevo departamento")} className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input type="color" aria-label={t("Color")} className="h-8 w-10 rounded" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        <Button type="submit" tone="primary">{t("Añadir")}</Button>
      </form>
    </section>
  );
}

function Supervisions() {
  const client = useQueryClient();
  const agents = useOffice((s) => s.agents);
  const { data = [] } = useQuery({ queryKey: ["supervisions"], queryFn: () => api.get<Supervision[]>("/supervisions") });
  const [form, setForm] = useState({ supervisor_id: "", supervised_id: "", kind: "review", tools: [] as string[] });
  const [error, setError] = useState<unknown>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["supervisions"] });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api.post("/supervisions", form);
      await refresh();
    } catch (failure) {
      setError(failure);
    }
  };
  const name = (id: string) => agents[id]?.name ?? id.slice(0, 8);
  const select = (label: string, key: "supervisor_id" | "supervised_id") => (
    <Field label={label}>
      <select required className={inputClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
        <option value="">{t("Elige agente")}</option>
        {Object.values(agents).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </Field>
  );
  return (
    <section className="space-y-2 rounded bg-ink-soft p-3">
      <h2 className="font-semibold">{t("Supervisión")}</h2>
      <form onSubmit={submit} className="space-y-2">
        {select("Supervisor", "supervisor_id")}
        {select("Supervisado", "supervised_id")}
        <Field label={t("Tipo")}>
          <select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
        {form.kind === "pre_approval" && (
          <ToolPicker value={form.tools} onChange={(tools) => setForm({ ...form, tools })} />
        )}
        <ErrorNote error={error} />
        <Button type="submit">{t("Añadir")}</Button>
      </form>
      <ul className="text-sm">
        {data.filter((s) => s.kind !== "observer").map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 border-t border-ink-line py-1">
            <span>{name(item.supervisor_id)} → {name(item.supervised_id)}: {KINDS[item.kind]} {item.tools.join(", ")}</span>
            <Button onClick={async () => { await api.del(`/supervisions/${item.id}`); await refresh(); }}>{t("Quitar")}</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OrgChartPage() {
  const { data = [] } = useQuery({ queryKey: ["org"], queryFn: () => api.get<Node[]>("/org-chart") });
  return (
    <div className="grid h-full grid-cols-[1fr_22rem] gap-4 overflow-y-auto p-4">
      <div>
        <h1 className="page-title mb-3">{t("Organigrama")}</h1>
        <p className="mb-2 text-sm text-slate-300">{t("Dueño · Consejo de Administración")}</p>
        <ul>{data.map((node) => <Branch key={node.id} node={node} />)}</ul>
      </div>
      <div className="space-y-3">
        <HireForm />
        <Departments />
        <Supervisions />
      </div>
    </div>
  );
}
