import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/api/client";
import type { Anomaly, AuditEvent } from "@/api/types";
import { Button, Empty, inputClass } from "@/shared/ui";
import { useOffice } from "@/store/office";

export function AnomalyList() {
  const client = useQueryClient();
  const agents = useOffice((s) => s.agents);
  const { data = [] } = useQuery({ queryKey: ["anomalies"], queryFn: () => api.get<Anomaly[]>("/audit/anomalies?status=open") });
  const close = async (id: string, status: string) => {
    await api.patch(`/audit/anomalies/${id}`, { status });
    await client.invalidateQueries({ queryKey: ["anomalies"] });
    await client.invalidateQueries({ queryKey: ["status-bar"] });
  };
  if (!data.length) return <Empty>Sin anomalías abiertas</Empty>;
  return (
    <ul className="space-y-1 text-sm">
      {data.map((item) => (
        <li key={item.id} className="flex items-center gap-2 rounded bg-ink-soft p-2">
          <span aria-hidden>🛡</span>
          <span className="flex-1">{item.rule} · {item.severity} · {agents[item.agent_id ?? ""]?.name ?? "Sistema"}</span>
          <Button onClick={() => close(item.id, "resolved")}>Resolver</Button>
          <Button onClick={() => close(item.id, "dismissed")}>Descartar</Button>
        </li>
      ))}
    </ul>
  );
}

export function EventLog({ limit = 200 }: { limit?: number }) {
  const agents = useOffice((s) => s.agents);
  const [filters, setFilters] = useState({ agent: "", type: "", from: "", to: "" });
  const params = new URLSearchParams(Object.entries({ ...filters, limit: String(limit) }).filter(([, v]) => v));
  const { data = [] } = useQuery({
    queryKey: ["audit-events", params.toString()],
    refetchInterval: 5000,
    queryFn: () => api.get<AuditEvent[]>(`/audit/events?${params}`),
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Filtrar por agente" className={`${inputClass} w-40`} value={filters.agent} onChange={(e) => setFilters({ ...filters, agent: e.target.value })}>
          <option value="">Todos</option>
          {Object.values(agents).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input aria-label="Tipo de acción" className={`${inputClass} w-40`} placeholder="Tipo (tool, task…)" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} />
        <input aria-label="Desde" type="date" className={`${inputClass} w-36`} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input aria-label="Hasta" type="date" className={`${inputClass} w-36`} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-slate-300">
          <tr><th>#</th><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Objeto</th><th className="text-right">Coste</th></tr>
        </thead>
        <tbody>
          {data.map((event) => (
            <tr key={event.seq} className="border-t border-ink-line">
              <td>{event.seq}</td>
              <td>{new Date(event.created_at).toLocaleTimeString()}</td>
              <td>{agents[event.actor]?.name ?? event.actor}</td>
              <td>{event.type}</td>
              <td className="max-w-60 truncate">{event.target}</td>
              <td className="text-right tabular-nums">{Number(event.cost_eur).toFixed(5)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuditPage() {
  const [verdict, setVerdict] = useState<{ valid: boolean; checked: number; broken_at_seq: number | null } | null>(null);
  return (
    <div className="mx-auto h-full max-w-5xl space-y-4 overflow-y-auto p-4">
      <h1 className="text-lg font-semibold">Auditoría</h1>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button onClick={async () => setVerdict(await api.get("/audit/verify"))}>Verificar integridad</Button>
        <a className="underline" href="/api/v1/audit/export?format=csv">Exportar CSV</a>
        <a className="underline" href="/api/v1/audit/export?format=json">Exportar JSON</a>
        {verdict && (
          <span role="status">
            {verdict.valid ? `✓ Cadena íntegra (${verdict.checked} eventos)` : `✕ Cadena rota en el evento ${verdict.broken_at_seq}`}
          </span>
        )}
      </div>
      <section>
        <h2 className="mb-1 font-semibold">Anomalías</h2>
        <AnomalyList />
      </section>
      <section>
        <h2 className="mb-1 font-semibold">Registro</h2>
        <EventLog />
      </section>
    </div>
  );
}
