import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api } from "@/api/client";
import type { AgentStatus } from "@/api/types";
import { STATUS } from "@/office/status";
import { Button, ErrorNote, Field, inputClass } from "@/shared/ui";
import { useOffice } from "@/store/office";

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

const KINDS: Record<string, string> = { review: "Revisión de resultados", pre_approval: "Aprobación previa", observer: "Observador" };

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

function HireForm() {
  const client = useQueryClient();
  const snapshot = useOffice((s) => s.snapshot);
  const agents = useOffice((s) => s.agents);
  const [form, setForm] = useState({ name: "", role: "", home_room_id: "", manager_id: "", department_id: "", model: "fast" });
  const [error, setError] = useState<unknown>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api.post("/agents", {
        ...form,
        manager_id: form.manager_id || null,
        department_id: form.department_id || null,
        tools: ["search_files", "read_file", "write_file", "search_knowledge", "ask_manager"],
      });
      setForm({ ...form, name: "", role: "" });
      await client.invalidateQueries({ queryKey: ["org"] });
      await client.invalidateQueries({ queryKey: ["snapshot"] });
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2 rounded bg-ink-soft p-3">
      <h2 className="font-semibold">Contratar agente</h2>
      <Field label="Nombre"><input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Rol"><input required className={inputClass} placeholder="seo, contable…" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
      <Field label="Sala base">
        <select required className={inputClass} value={form.home_room_id} onChange={(e) => setForm({ ...form, home_room_id: e.target.value })}>
          <option value="">Elige sala</option>
          {snapshot?.office.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>
      <Field label="Departamento">
        <select className={inputClass} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
          <option value="">Sin departamento</option>
          {snapshot?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Jefe">
        <select className={inputClass} value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
          <option value="">Sin jefe</option>
          {Object.values(agents).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Modelo"><input className={inputClass} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
      <ErrorNote error={error} />
      <Button type="submit" tone="primary">Contratar</Button>
    </form>
  );
}

function Supervisions() {
  const client = useQueryClient();
  const agents = useOffice((s) => s.agents);
  const { data = [] } = useQuery({ queryKey: ["supervisions"], queryFn: () => api.get<Supervision[]>("/supervisions") });
  const [form, setForm] = useState({ supervisor_id: "", supervised_id: "", kind: "review", tools: "" });
  const [error, setError] = useState<unknown>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["supervisions"] });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api.post("/supervisions", { ...form, tools: form.tools.split(",").map((t) => t.trim()).filter(Boolean) });
      await refresh();
    } catch (failure) {
      setError(failure);
    }
  };
  const name = (id: string) => agents[id]?.name ?? id.slice(0, 8);
  const select = (label: string, key: "supervisor_id" | "supervised_id") => (
    <Field label={label}>
      <select required className={inputClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
        <option value="">Elige agente</option>
        {Object.values(agents).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </Field>
  );
  return (
    <section className="space-y-2 rounded bg-ink-soft p-3">
      <h2 className="font-semibold">Supervisión</h2>
      <form onSubmit={submit} className="space-y-2">
        {select("Supervisor", "supervisor_id")}
        {select("Supervisado", "supervised_id")}
        <Field label="Tipo">
          <select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
        {form.kind === "pre_approval" && (
          <Field label="Herramientas (separadas por comas)">
            <input className={inputClass} value={form.tools} onChange={(e) => setForm({ ...form, tools: e.target.value })} />
          </Field>
        )}
        <ErrorNote error={error} />
        <Button type="submit">Añadir</Button>
      </form>
      <ul className="text-sm">
        {data.filter((s) => s.kind !== "observer").map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 border-t border-ink-line py-1">
            <span>{name(item.supervisor_id)} → {name(item.supervised_id)}: {KINDS[item.kind]} {item.tools.join(", ")}</span>
            <Button onClick={async () => { await api.del(`/supervisions/${item.id}`); await refresh(); }}>Quitar</Button>
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
        <h1 className="mb-2 text-lg font-semibold">Organigrama</h1>
        <p className="mb-2 text-sm text-slate-300">Dueño · Consejo de Administración</p>
        <ul>{data.map((node) => <Branch key={node.id} node={node} />)}</ul>
      </div>
      <div className="space-y-3">
        <HireForm />
        <Supervisions />
      </div>
    </div>
  );
}
